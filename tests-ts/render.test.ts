import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { renderPayload } from "../src/render.js";

const payload = JSON.parse(readFileSync(path.resolve("tests/fixtures/sample-payload.json"), "utf-8")) as unknown;
const savedEnv = { ...process.env };
const tmpHome = path.resolve(".test-home", "render-tests");

beforeEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  process.env = { ...savedEnv, HOME: tmpHome, COPILOT_OTEL_DIR: path.join(tmpHome, ".copilot", "otel") };
  delete process.env.COPILOT_COST_FORMAT;
  delete process.env.COPILOT_COST_HIDE_ZERO;
  delete process.env.COPILOT_COST_NO_COLOR;
  delete process.env.COPILOT_COST_COLOR;
  delete process.env.NO_COLOR;
});

afterEach(() => {
  process.env = { ...savedEnv };
  rmSync(tmpHome, { recursive: true, force: true });
});

describe("renderPayload", () => {
  it("renders default standard format", () => {
    process.env.COPILOT_COST_NO_COLOR = "1";
    const output = renderPayload(payload, { persist: false });
    expect(output).toContain("$");
    expect(output).toContain("38.2k in / 6.1k out");
  });

  it("does not write session metadata when persistence is disabled", () => {
    process.env.COPILOT_COST_NO_COLOR = "1";
    renderPayload(payload, { persist: false });
    expect(existsSync(path.join(process.env.COPILOT_OTEL_DIR ?? "", "copilot-cost-meta.jsonl"))).toBe(false);
  });

  it("renders a numeric amount for non-numeric token counts", () => {
    process.env.COPILOT_COST_NO_COLOR = "1";
    const malformedPayload = JSON.parse(JSON.stringify(payload)) as { context_window: { total_input_tokens: string } };
    malformedPayload.context_window.total_input_tokens = "not-a-number";

    const output = renderPayload(malformedPayload, { persist: false });

    expect(output).toMatch(/\$\d+\.\d{4}/);
    expect(output).not.toContain("NaN");
  });

  it("renders compact format", () => {
    process.env.COPILOT_COST_NO_COLOR = "1";
    process.env.COPILOT_COST_FORMAT = "compact";
    expect(renderPayload(payload, { persist: false })).toMatch(/^\$\d+\.\d{4}$/);
  });

  it("renders verbose format", () => {
    process.env.COPILOT_COST_NO_COLOR = "1";
    process.env.COPILOT_COST_FORMAT = "verbose";
    const output = renderPayload(payload, { persist: false });
    expect(output).toContain("fresh / 12.0k cache rd / 3.1k cache wr / 6.1k out");
    expect(output).toContain("900 reason");
  });

  it("strips ANSI color when color is disabled", () => {
    process.env.COPILOT_COST_NO_COLOR = "1";
    const output = renderPayload(payload, { persist: false });
    expect(output).not.toMatch(/\u001b\[/);
  });

  it("renders a zero placeholder by default when payload has no usage", () => {
    process.env.COPILOT_COST_NO_COLOR = "1";
    expect(renderPayload({}, { persist: false })).toBe("$0.0000 · 0 in / 0 out");
  });

  it("returns empty string when payload has no usage and COPILOT_COST_HIDE_ZERO is set", () => {
    process.env.COPILOT_COST_NO_COLOR = "1";
    process.env.COPILOT_COST_HIDE_ZERO = "1";
    expect(renderPayload({}, { persist: false })).toBe("");
  });

  it("renders a zero placeholder in compact format by default", () => {
    process.env.COPILOT_COST_NO_COLOR = "1";
    process.env.COPILOT_COST_FORMAT = "compact";
    expect(renderPayload({}, { persist: false })).toBe("$0.0000");
  });
});
