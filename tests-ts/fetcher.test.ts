import { describe, expect, it } from "vitest";
import { parsePricingYaml } from "../src/pricing/fetcher.js";

describe("pricing fetcher", () => {
  it("parses upstream YAML rows and maps vendors", () => {
    const yaml = `
- model: 'GPT-4.1[^1]'
  provider: openai
  release_status: GA
  category: Versatile
  input: $2.00
  cached_input: $0.50
  output: $8.00

- model: Claude Opus 4.7
  provider: anthropic
  release_status: GA
  category: Powerful
  input: $5.00
  cached_input: $0.50
  output: $25.00
  cache_write: $6.25

- model: 'Gemini 2.5 Pro[^5]'
  provider: google
  release_status: GA
  category: Powerful
  input: $1.25
  cached_input: $0.125
  output: $10.00
  notes: "Prompts \\u2264200K tokens"

- model: GPT-5.4
  provider: openai
  release_status: GA
  category: Versatile
  threshold: '≤ 272K'
  tier: Default
  input: $2.50
  cached_input: $0.25
  output: $15.00

- model: GPT-5.4
  provider: openai
  release_status: GA
  category: Versatile
  threshold: '> 272K'
  tier: Long context
  input: $5.00
  cached_input: $0.50
  output: $22.50

- model: MAI-Code-1-Flash
  provider: microsoft
  release_status: GA
  category: Lightweight
  input: $0.75
  cached_input: $0.075
  output: $4.50

- model: Kimi K2.7 Code
  provider: moonshot_ai
  release_status: GA
  category: Versatile
  input: $0.95
  cached_input: $0.19
  output: $4.00
`;
const data = parsePricingYaml(yaml);
expect(data.models["gpt-4.1"]?.vendor).toBe("openai");
expect(data.models["gpt-4.1"]?.input).toBe(2);
expect(data.models["claude-opus-4.7"]?.vendor).toBe("anthropic");
expect(data.models["claude-opus-4.7"]?.cache_write).toBe(6.25);
expect(data.models["gemini-2.5-pro"]?.vendor).toBe("google");
expect(data.models["gemini-2.5-pro"]?.cached_input).toBe(0.125);
expect(data.models["gpt-5.4"]?.input).toBe(2.5);
expect(data.models["mai-code-1-flash"]?.vendor).toBe("microsoft");
expect(data.models["kimi-k2.7-code"]?.vendor).toBe("moonshot_ai");
  });
});
