import { expect, it } from "vitest";
import { settingsCheckActivity } from "../src/shared/settings-check-accounting";
import { formatGovernanceCost } from "../src/client/governance/format-cost";
import type { SettingsCheckRecord } from "../src/shared/request-settings-review";
const base: SettingsCheckRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  requestHash: "a".repeat(64),
  startedAt: "2026-01-01T00:00:00Z",
  model: "jev-1.14.0",
  status: "compatible",
  events: [],
};
it("accounts recorded pre-project calls without double billing repeated usage", () => {
  const usage = {
    type: "usage",
    message: "done",
    data: {
      invocationId: "call",
      model: "jev-1.14.0",
      usage: { input_tokens: 1962, output_tokens: 249 },
    },
  };
  const row = settingsCheckActivity({
    ...base,
    events: [
      { type: "invocation", message: "start", data: { invocationId: "call" } },
      usage,
      usage,
    ],
  });
  expect(row.calls).toBe(1);
  expect(row.inputTokens).toBe(1962);
  expect(row.outputTokens).toBe(249);
  expect(row.costLow).toBeCloseTo(0.000082404, 12);
  expect(formatGovernanceCost(row.costLow!)).toBe("$0.00008240");
});
it("retains unknown usage/pricing instead of inventing a zero charge", () => {
  expect(settingsCheckActivity(base).costLow).toBeNull();
  const row = settingsCheckActivity({
    ...base,
    model: "jev-future",
    events: [
      { type: "usage", message: "done", data: { usage: { input_tokens: 50, output_tokens: 2 } } },
    ],
  });
  expect(row.inputTokens).toBe(50);
  expect(row.costLow).toBeNull();
});
it("preserves explicit zero usage and provider reported charges", () => {
  const free = settingsCheckActivity({
    ...base,
    events: [
      { type: "usage", message: "done", data: { usage: { input_tokens: 0, output_tokens: 0 } } },
    ],
  });
  expect(free.costLow).toBe(0);
  const reported = settingsCheckActivity({
    ...base,
    events: [{ type: "usage", message: "done", data: { cost: 0.5, usage: { input_tokens: 10 } } }],
  });
  expect(reported.costLow).toBe(0.5);
  expect(reported.costBasis).toBe("SDK reported cost");
});
