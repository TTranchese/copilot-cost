import { readFileSync, statSync } from "node:fs";
import { resolveOtelFiles } from "./paths.js";
import { type NormalizedCall, normalizeSpan } from "./parser.js";
import { metaFilePath, readSessionMeta, type SessionMetaEntry } from "../util/session-meta.js";

export interface ReadOptions { since?: Date; until?: Date }

interface CacheEntry {
  mtimeMs: number;
  size: number;
  calls: NormalizedCall[];
}

const cache = new Map<string, CacheEntry>();
let enrichedCache: { fingerprint: string; calls: NormalizedCall[] } | null = null;

// Clears both the per-file parse cache and the derived enriched/sorted cache so tests
// and callers can reset all reader state with one function.
export function clearCache(): void {
  cache.clear();
  enrichedCache = null;
}

function fileFingerprint(file: string): string {
  try {
    const st = statSync(file);
    return `${file}:${st.mtimeMs}:${st.size}`;
  } catch {
    return `${file}:0:0`;
  }
}

function enrichedFingerprint(files: string[]): string {
  return [...files, metaFilePath()].map(fileFingerprint).join("|");
}

function parseFile(file: string): NormalizedCall[] {
  const st = statSync(file);
  const cached = cache.get(file);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) return cached.calls;

  const seen = new Set<string>();
  const calls: NormalizedCall[] = [];
  for (const line of readFileSync(file, "utf-8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const call = normalizeSpan(JSON.parse(line) as unknown);
      if (call && !seen.has(call.dedup_key)) {
        seen.add(call.dedup_key);
        calls.push(call);
      }
    } catch {
      // Ignore malformed exporter lines; future reads will retry if file metadata changes.
    }
  }
  cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, calls });
  return calls;
}

// Render is invoked by the statusline both at chat open and after each turn,
// so a sidecar entry may sit just before or after a chat span. Use a generous
// symmetric window to tolerate either ordering and clock skew.
const META_WINDOW_MS = 30 * 60 * 1000;

function lowerBoundMeta(meta: SessionMetaEntry[], minTime: number): number {
  let lo = 0;
  let hi = meta.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const t = Date.parse(meta[mid]?.ts ?? "");
    if (!Number.isFinite(t) || t < minTime) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function findMeta(meta: SessionMetaEntry[], call: NormalizedCall): SessionMetaEntry | null {
  if (!meta.length) return null;
  const callTime = Date.parse(call.ts);
  if (!Number.isFinite(callTime)) return null;
  const targetSessionId = call.session_id ?? call.conversation_id ?? null;

  const minTime = callTime - META_WINDOW_MS;
  const maxTime = callTime + META_WINDOW_MS;
  const start = lowerBoundMeta(meta, minTime);
  let best: SessionMetaEntry | null = null;
  for (let i = start; i < meta.length; i += 1) {
    const entry = meta[i];
    if (!entry) continue;
    const t = Date.parse(entry.ts);
    if (!Number.isFinite(t)) continue;
    if (t > maxTime) break;
    const delta = Math.abs(t - callTime);
    const sameSession = targetSessionId !== null && entry.session_id === targetSessionId ? 1 : 0;
    const sameModel = entry.model && entry.model === call.model ? 1 : 0;
    const completeness = Number(Boolean(entry.session_name)) + Number(Boolean(entry.cwd)) + Number(Boolean(entry.model));
    if (!best) {
      best = entry;
      continue;
    }
    const bestTime = Date.parse(best.ts);
    const bestDelta = Number.isFinite(bestTime) ? Math.abs(bestTime - callTime) : Number.POSITIVE_INFINITY;
    const bestSameSession = targetSessionId !== null && best.session_id === targetSessionId ? 1 : 0;
    const bestSameModel = best.model && best.model === call.model ? 1 : 0;
    const bestCompleteness = Number(Boolean(best.session_name)) + Number(Boolean(best.cwd)) + Number(Boolean(best.model));
    if (
      sameSession > bestSameSession ||
      (sameSession === bestSameSession && sameModel > bestSameModel) ||
      (sameSession === bestSameSession && sameModel === bestSameModel && completeness > bestCompleteness) ||
      (sameSession === bestSameSession && sameModel === bestSameModel && completeness === bestCompleteness && delta < bestDelta)
    ) {
      best = entry;
    }
  }
  return best;
}

function enrich(calls: NormalizedCall[]): NormalizedCall[] {
  const meta = readSessionMeta();
  return calls.map((call) => {
    const match = meta.length ? findMeta(meta, call) : null;
    const sessionId = call.session_id ?? match?.session_id ?? call.conversation_id ?? null;
    const sessionName = call.session_name ?? match?.session_name ?? null;
    const cwd = call.cwd ?? match?.cwd ?? null;
    if (sessionId === call.session_id && sessionName === (call.session_name ?? null) && cwd === (call.cwd ?? null)) return call;
    return { ...call, session_id: sessionId, session_name: sessionName, cwd };
  });
}

function filterByTime(calls: NormalizedCall[], opts: ReadOptions): NormalizedCall[] {
  const since = opts.since?.getTime();
  const until = opts.until?.getTime();
  if (since === undefined && until === undefined) return calls;
  return calls.filter((call) => {
    const t = Date.parse(call.ts);
    if (since !== undefined && t < since) return false;
    if (until !== undefined && t > until) return false;
    return true;
  });
}

export function readAllCalls(opts: ReadOptions = {}): NormalizedCall[] {
  const files = resolveOtelFiles();
  const fingerprint = enrichedFingerprint(files);
  if (enrichedCache?.fingerprint === fingerprint) return filterByTime(enrichedCache.calls, opts);

  const seen = new Set<string>();
  const out: NormalizedCall[] = [];
  for (const file of files) {
    for (const call of parseFile(file)) {
      if (seen.has(call.dedup_key)) continue;
      seen.add(call.dedup_key);
      out.push(call);
    }
  }

  const calls = enrich(out).sort((a, b) => a.ts.localeCompare(b.ts));
  enrichedCache = { fingerprint, calls };
  return filterByTime(calls, opts);
}
