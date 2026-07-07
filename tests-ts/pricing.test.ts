import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_USD_TO_EUR_AS_OF, DEFAULT_USD_TO_EUR_RATE, eurSnapshot, usdToEur } from "../src/pricing/currency.js";
import { clearPricingCache, computeCost, loadPricing, normalizeModel } from "../src/pricing/loader.js";

const root = path.resolve(".test-work", "pricing-loader");
const pricingFile = path.join(root, "pricing.yaml");

function pricingYaml(input: number, extra = ""): string {
  return `schema_version: 1
fetched_at: "2025-01-01T00:00:00.000Z"
models:
  gpt-5-mini:
    vendor: openai
    input: ${input}
    cached_input: 0.1
    output: 2
${extra}`;
}

beforeEach(() => {
  clearPricingCache();
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  clearPricingCache();
  rmSync(root, { recursive: true, force: true });
});

describe("pricing loader", () => {
  it("loads the bundled snapshot with numeric prices", () => {
    const pricing = loadPricing();
    expect(Object.keys(pricing.models).length).toBeGreaterThanOrEqual(3);
    const first = Object.values(pricing.models)[0];
    expect(first).toBeDefined();
    expect(typeof first?.input).toBe("number");
    expect(typeof first?.cached_input).toBe("number");
    expect(typeof first?.output).toBe("number");
  });

  it("memoizes pricing by path until the file changes", () => {
    writeFileSync(pricingFile, pricingYaml(1), "utf-8");

    const first = loadPricing(pricingFile);
    const second = loadPricing(pricingFile);

    expect(second).toBe(first);
  });

  it("invalidates memoized pricing when mtime or size changes", () => {
    writeFileSync(pricingFile, pricingYaml(1), "utf-8");
    const first = loadPricing(pricingFile);

    writeFileSync(pricingFile, pricingYaml(3, "    cache_write: 4\n"), "utf-8");
    const second = loadPricing(pricingFile);

    expect(second).not.toBe(first);
    expect(second.models["gpt-5-mini"]?.input).toBe(3);
    expect(second.models["gpt-5-mini"]?.cache_write).toBe(4);
  });

  it("clearPricingCache forces pricing to be read again", () => {
    writeFileSync(pricingFile, pricingYaml(1), "utf-8");
    const first = loadPricing(pricingFile);

    clearPricingCache();
    const second = loadPricing(pricingFile);

    expect(second).not.toBe(first);
    expect(second.models["gpt-5-mini"]?.input).toBe(1);
  });

  it("normalizes internal and fast suffixes", () => {
    expect(normalizeModel("claude-opus-4.7-1m-internal")).toBe("claude-opus-4.7");
    expect(normalizeModel("gpt-5-mini-fast")).toBe("gpt-5-mini");
  });

  it("normalizes display names and auto labels", () => {
    expect(normalizeModel("Claude Opus 4.7")).toBe("claude-opus-4.7");
    expect(normalizeModel("GPT-5 mini")).toBe("gpt-5-mini");
    expect(normalizeModel("Auto (Claude Sonnet 4.6)")).toBe("claude-sonnet-4.6");
  });

  it("maps internal and legacy model ids to best-effort public pricing aliases", () => {
    expect(normalizeModel("copilot-nes-oct")).toBe("raptor-mini");
    expect(normalizeModel("copilot-suggestions-himalia-001")).toBe("raptor-mini");
    expect(normalizeModel("gpt-4o-mini-2024-07-18")).toBe("gpt-5-mini");
  });

  it("computes cost using fresh, cache read, cache write, and output tokens", () => {
    const price = { vendor: "anthropic", input: 5, cached_input: 0.5, cache_write: 6.25, output: 25 };
    const cost = computeCost({ input: 38_200, cache_read: 12_000, cache_write: 3_100, output: 6_100 }, price);
    expect(cost).toBeCloseTo(0.293375, 9);
  });

  it("exposes the default EUR conversion snapshot", () => {
    expect(eurSnapshot()).toMatchObject({
      base_currency: "USD",
      quote_currency: "EUR",
      as_of: DEFAULT_USD_TO_EUR_AS_OF,
    });
    expect(eurSnapshot().rate).toBeCloseTo(DEFAULT_USD_TO_EUR_RATE, 12);
  });

  it("allows overriding the EUR conversion rate via environment variables", () => {
    const snapshot = eurSnapshot({
      ...process.env,
      COPILOT_COST_EUR_RATE: "0.91",
      COPILOT_COST_EUR_RATE_AS_OF: "2026-06-24",
      COPILOT_COST_EUR_RATE_SOURCE: "manual override",
    });
    expect(snapshot).toEqual({
      base_currency: "USD",
      quote_currency: "EUR",
      rate: 0.91,
      as_of: "2026-06-24",
      source: "manual override",
    });
    expect(usdToEur(2, { COPILOT_COST_EUR_RATE: "0.91" })).toBeCloseTo(1.82, 12);
  });
});
