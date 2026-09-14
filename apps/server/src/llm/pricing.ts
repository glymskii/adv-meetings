/** Цены за 1M токенов (USD), Claude API, сентябрь 2026. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

export function estimateCostUsd(model: string, usage: { input: number; output: number; cacheRead?: number; cacheWrite?: number }): number {
  const p = PRICES[model] ?? PRICES["claude-opus-5"]!;
  const usd =
    (usage.input * p.input + usage.output * p.output + (usage.cacheRead ?? 0) * p.cacheRead + (usage.cacheWrite ?? 0) * p.cacheWrite) / 1_000_000;
  return Math.round(usd * 10000) / 10000;
}
