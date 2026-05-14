export type YamlScalar = string | number | boolean | null;

const numRe = /^-?\d+(?:\.\d+)?$/;

export function stripComment(line: string): string {
  return line.split("#", 1)[0] ?? "";
}

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseScalar(value: string): YamlScalar {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (["null", "Null", "NULL", "~"].includes(trimmed)) return null;
  if (["true", "True"].includes(trimmed)) return true;
  if (["false", "False"].includes(trimmed)) return false;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return unquote(trimmed);
  }
  if (numRe.test(trimmed)) {
    return trimmed.includes(".") ? Number.parseFloat(trimmed) : Number.parseInt(trimmed, 10);
  }
  return trimmed;
}

export function parseDollar(raw: string | undefined): number {
  if (raw == null) return 0;
  const cleaned = unquote(raw).replace(/[$,]/g, "").trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}
