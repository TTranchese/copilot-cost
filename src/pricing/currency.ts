import process from "node:process";

export interface CurrencySnapshot {
  base_currency: "USD";
  quote_currency: "EUR";
  rate: number;
  as_of: string;
  source: string;
}

export const DEFAULT_USD_TO_EUR_RATE = 1 / 1.1392;
export const DEFAULT_USD_TO_EUR_AS_OF = "2026-06-23";
export const DEFAULT_USD_TO_EUR_SOURCE = "ECB euro reference rate";

function parsePositiveNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function eurSnapshot(env: NodeJS.ProcessEnv = process.env): CurrencySnapshot {
  return {
    base_currency: "USD",
    quote_currency: "EUR",
    rate: parsePositiveNumber(env.COPILOT_COST_EUR_RATE) ?? DEFAULT_USD_TO_EUR_RATE,
    as_of: env.COPILOT_COST_EUR_RATE_AS_OF?.trim() || DEFAULT_USD_TO_EUR_AS_OF,
    source: env.COPILOT_COST_EUR_RATE_SOURCE?.trim() || DEFAULT_USD_TO_EUR_SOURCE,
  };
}

export function usdToEur(value: number, env: NodeJS.ProcessEnv = process.env): number {
  return Number(value || 0) * eurSnapshot(env).rate;
}
