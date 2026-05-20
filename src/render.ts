import process from "node:process";
import { computeCost, getModelPrice, normalizeModel } from "./pricing/loader.js";
import { appendSessionMeta } from "./util/session-meta.js";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function intValue(source: JsonObject, key: string): number {
  const value = source[key];
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function numValue(source: JsonObject, key: string): number | null {
  const value = source[key];
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function strValue(source: JsonObject, key: string): string | null {
  const value = source[key];
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function short(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function firstNumber(source: JsonObject, keys: string[]): number | null {
  for (const key of keys) {
    const value = numValue(source, key);
    if (value !== null) return value;
  }
  return null;
}

function payloadAic(root: JsonObject): number | null {
  const cost = asObject(root.cost);
  return firstNumber(cost, [
    "total_ai_credits",
    "total_aic",
    "ai_credits",
    "aic",
    "total_cost_ai_credits",
  ]) ?? firstNumber(root, [
    "total_ai_credits",
    "total_aic",
    "ai_credits",
    "aic",
  ]);
}

function formatAic(aic: number | null, model: string | null): string {
  if (aic !== null) return `${aic.toFixed(2)} AIC`;
  return model ? `? AIC (${model})` : "? AIC";
}

function modelCandidates(root: JsonObject): string[] {
  const modelInfo = asObject(root.model);
  const values = [
    strValue(modelInfo, "id"),
    strValue(modelInfo, "resolved_id"),
    strValue(modelInfo, "selected_id"),
    strValue(modelInfo, "selected_model"),
    strValue(modelInfo, "display_name"),
    strValue(modelInfo, "name"),
    strValue(root, "model_id"),
    strValue(root, "resolved_model"),
    strValue(root, "selected_model"),
  ];
  return [...new Set(values.filter((value): value is string => value !== null))];
}

export function renderPayload(payload: unknown, opts: { persist?: boolean } = {}): string {
  const root = asObject(payload);
  const candidates = modelCandidates(root);
  const fallbackModel = candidates[0];
  const pricedModel = candidates.map((candidate) => ({ raw: candidate, ...getModelPrice(candidate) })).find((candidate) => candidate.price);
  const rawModel = pricedModel?.raw ?? fallbackModel;
  const cw = asObject(root.context_window);
  const totalInput = intValue(cw, "total_input_tokens");
  const output = intValue(cw, "total_output_tokens");
  const cacheRead = intValue(cw, "total_cache_read_tokens");
  const cacheWrite = intValue(cw, "total_cache_write_tokens");

  const sessionId = strValue(root, "session_id");
  if (sessionId && opts.persist !== false && !process.env.COPILOT_COST_NO_META) {
    const { model: normModel } = getModelPrice(rawModel);
    appendSessionMeta({
      ts: new Date().toISOString(),
      session_id: sessionId,
      session_name: strValue(root, "session_name"),
      cwd: strValue(root, "cwd"),
      model: normModel ?? (rawModel ? normalizeModel(rawModel) ?? rawModel : null),
    });
  }

  const isEmpty = totalInput === 0 && output === 0;
  const hideZero = !!process.env.COPILOT_COST_HIDE_ZERO;
  if (isEmpty && hideZero) {
    return "";
  }

  const { price } = pricedModel ?? getModelPrice(rawModel);
  let usd: number | null = 0;
  if (price) {
    usd = computeCost({ input: totalInput, cache_read: cacheRead, cache_write: cacheWrite, output }, price);
  } else if (!isEmpty) {
    usd = null;
  }
  const explicitAic = payloadAic(root);
  const aic = explicitAic ?? (usd === null ? null : usd * 100);
  const fmt = process.env.COPILOT_COST_FORMAT ?? "standard";
  const reasoning = intValue(cw, "total_reasoning_tokens");
  const fresh = Math.max(totalInput - cacheRead - cacheWrite, 0);
  const shownModel = normalizeModel(rawModel) ?? (rawModel ? String(rawModel).trim() : null);
  const aicText = formatAic(aic, usd === null ? shownModel : null);
  const displayUsd = explicitAic === null ? usd : explicitAic / 100;

  let body: string;
  if (fmt === "compact" || fmt === "minimal") {
    body = aicText;
  } else if (fmt === "full" || fmt === "verbose") {
    const parts = [
      displayUsd === null ? aicText : `${aicText} ($${displayUsd.toFixed(4)})`,
      `${short(fresh)} fresh / ${short(cacheRead)} cache rd / ${short(cacheWrite)} cache wr / ${short(output)} out`,
      `Σ ${short(totalInput + output)}`,
    ];
    if (reasoning) parts.push(`${short(reasoning)} reason`);
    body = parts.join(" · ");
  } else {
    const parts = [aicText, `${short(totalInput)} in / ${short(output)} out`];
    if (cacheRead || cacheWrite) parts.push(`${short(cacheRead + cacheWrite)} cache`);
    body = parts.join(" · ");
  }

  if (process.env.COPILOT_COST_NO_COLOR || process.env.NO_COLOR) {
    return body;
  }
  const color = process.env.COPILOT_COST_COLOR ?? "90";
  return `\u001b[${color}m${body}\u001b[0m`;
}
