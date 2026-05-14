import { describe, expect, it } from "vitest";
import { parseDollar, parseScalar, unquote } from "../src/pricing/yaml-utils.js";

describe("pricing YAML utils", () => {
  it("unquotes single and double quoted strings", () => {
    expect(unquote("'gpt-5-mini'")).toBe("gpt-5-mini");
    expect(unquote('"claude opus"')).toBe("claude opus");
    expect(unquote("  'spaced'  ")).toBe("spaced");
    expect(unquote("")).toBe("");
    expect(unquote("plain")).toBe("plain");
  });

  it("parses dollar amounts with whitespace and thousands separators", () => {
    expect(parseDollar(" $1.25 ")).toBe(1.25);
    expect(parseDollar("'$2,500.50'")).toBe(2500.5);
    expect(parseDollar('"$0.125"')).toBe(0.125);
    expect(parseDollar("")).toBe(0);
    expect(parseDollar(undefined)).toBe(0);
  });

  it("coerces YAML scalars used by snapshot pricing", () => {
    expect(parseScalar(" 42 ")).toBe(42);
    expect(parseScalar("0.125")).toBe(0.125);
    expect(parseScalar("'0.125'")).toBe("0.125");
    expect(parseScalar('"openai"')).toBe("openai");
    expect(parseScalar(" true ")).toBe(true);
    expect(parseScalar("False")).toBe(false);
    expect(parseScalar("~")).toBeNull();
    expect(parseScalar("   ")).toBe("");
  });
});
