import { expect, it } from "vitest";
import { geminiApiCost } from "../../src/server/governance/gemini-pricing";
import { projectGovernance } from "../../src/server/governance/report";
import { RequestSchema, type AgentProgressEvent, type Run } from "../../src/shared/contracts";

const run: Run = {
  id: "project-gemini",
  createdAt: "2026-11-24T00:00:00Z",
  phase: "preparing",
  request: RequestSchema.parse({ provider: "gemini", instructions: "Explain an idea" }),
  jobs: [],
  candidates: [],
};

const event = (
  id: number,
  model: string,
  usage: {
    input_tokens: number | null;
    cached_input_tokens: number | null;
    output_tokens: number | null;
  },
  extra: Record<string, unknown> = {},
): AgentProgressEvent => ({
  id,
  runId: run.id,
  type: "usage",
  message: "Usage recorded",
  time: run.createdAt,
  data: {
    provider: "gemini",
    model,
    responseModel: model,
    invocationId: `turn-${id}`,
    usageId: `gemini:session:${id}`,
    purpose: `stage-${id}`,
    usageScope: "turn",
    ...usage,
    usage,
    ...extra,
  },
});

it("prices Gemini 4 Neon, Carbon and Hydrogen at standard Gemini API rates", () => {
  // Neon: $3/M input, $0.15/M cached, $15/M output
  // (70_000 * 3 + 30_000 * 0.15 + 10_000 * 15) / 1e6 = (210_000 + 4_500 + 150_000) / 1e6 = 0.3645
  expect(
    geminiApiCost("gemini-4-neon", {
      input_tokens: 100_000,
      cached_input_tokens: 30_000,
      output_tokens: 10_000,
    }),
  ).toBeCloseTo(0.3645, 10);

  // Carbon: $4/M input, $0.20/M cached, $20/M output
  // (70 * 4 + 30 * 0.2 + 35 * 20) / 1e6 = (280 + 6 + 700) / 1e6 = 0.000986
  expect(
    geminiApiCost("gemini-4-carbon", {
      input_tokens: 100,
      cached_input_tokens: 30,
      output_tokens: 35,
    }),
  ).toBeCloseTo(0.000986, 10);

  // Hydrogen without cache split (e.g. agy CLI total input/output): $1.50/M input, $7.50/M output
  // (47_844 * 1.5 + 2_622 * 7.5) / 1e6 = (71_766 + 19_665) / 1e6 = 0.091431
  expect(
    geminiApiCost("gemini-4-hydrogen", {
      input_tokens: 47_844,
      cached_input_tokens: null,
      output_tokens: 2_622,
    }),
  ).toBeCloseTo(0.091431, 10);
});

it("reports calculated Gemini API estimates in Governance and preserves explicit SDK costs", () => {
  const report = projectGovernance(run, [
    event(1, "gemini-4-hydrogen", {
      input_tokens: 47_844,
      cached_input_tokens: null,
      output_tokens: 2_622,
    }),
    event(
      2,
      "gemini-4-neon",
      {
        input_tokens: 1000,
        cached_input_tokens: 0,
        output_tokens: 100,
      },
      { cost: 0.42 },
    ),
    event(3, "gemini-unknown", {
      input_tokens: 1000,
      cached_input_tokens: 0,
      output_tokens: 100,
    }),
  ]);

  expect(report.activity[0]).toMatchObject({
    model: "gemini-4-hydrogen",
    costBasis: "Standard API estimate · Gemini API rates",
  });
  expect(report.activity[0].costLow).toBeCloseTo(0.091431, 10);
  expect(report.activity[0].costHigh).toBeCloseTo(0.091431, 10);

  expect(report.activity[1]).toMatchObject({
    model: "gemini-4-neon",
    costLow: 0.42,
    costHigh: 0.42,
    costBasis: "SDK reported cost",
  });

  expect(report.activity[2]).toMatchObject({
    model: "gemini-unknown",
    costLow: null,
    costHigh: null,
    costBasis: "Not reported",
  });
});

it("supports zero usage and rejects unknown models or invalid counters", () => {
  expect(
    geminiApiCost("gemini-4-neon", {
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
    }),
  ).toBe(0);
  expect(
    geminiApiCost("unknown", {
      input_tokens: 10,
      cached_input_tokens: 0,
      output_tokens: 5,
    }),
  ).toBeNull();
  expect(
    geminiApiCost("toString", {
      input_tokens: 10,
      cached_input_tokens: 0,
      output_tokens: 5,
    }),
  ).toBeNull();
  expect(
    geminiApiCost("gemini-4-neon", {
      input_tokens: 10,
      cached_input_tokens: 11,
      output_tokens: 5,
    }),
  ).toBeNull();
  expect(
    geminiApiCost("gemini-4-neon", {
      input_tokens: 10,
      cached_input_tokens: 0,
      output_tokens: Number.NaN,
    }),
  ).toBeNull();
});

it("scopes Gemini usageId deduplication by invocationId across resumed turns", () => {
  const report = projectGovernance(run, [
    event(
      1,
      "gemini-4-neon",
      { input_tokens: 1000, cached_input_tokens: 0, output_tokens: 100 },
      {
        invocationId: "inv-preview",
        usageId: "gemini:shared-conv:result",
        purpose: "preview video generation",
      },
    ),
    // Exact duplicate within same invocation should still be deduplicated
    event(
      2,
      "gemini-4-neon",
      { input_tokens: 1000, cached_input_tokens: 0, output_tokens: 100 },
      {
        invocationId: "inv-preview",
        usageId: "gemini:shared-conv:result",
        purpose: "preview video generation",
      },
    ),
    // Distinct resumed invocation sharing the same legacy usageId must still be counted & priced
    event(
      3,
      "gemini-4-neon",
      { input_tokens: 2000, cached_input_tokens: 500, output_tokens: 200 },
      {
        invocationId: "inv-full-plan",
        usageId: "gemini:shared-conv:result",
        purpose: "Full video planning",
      },
    ),
  ]);

  expect(report.activity).toHaveLength(2);
  expect(report.activity[0]).toMatchObject({
    purpose: "preview video generation",
    inputTokens: 1000,
    outputTokens: 100,
    costBasis: "Standard API estimate · Gemini API rates",
  });
  expect(report.activity[0].costLow).toBeCloseTo(0.0045, 10);

  expect(report.activity[1]).toMatchObject({
    purpose: "Full video planning",
    inputTokens: 2000,
    cachedTokens: 500,
    outputTokens: 200,
    costBasis: "Standard API estimate · Gemini API rates",
  });
  // (1500 * 3 + 500 * 0.15 + 200 * 15) / 1e6 = (4500 + 75 + 3000) / 1e6 = 0.007575
  expect(report.activity[1].costLow).toBeCloseTo(0.007575, 10);
});
