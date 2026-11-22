import type { ModelActivity } from "./governance";
import type { SettingsCheckRecord } from "./request-settings-review";
import { jevCallUsage, recordedJevCalls } from "./jev-call-accounting";
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
/** Reconstructs pre-project billing from persisted events; no inference or account access. */
export function settingsCheckActivity(check: SettingsCheckRecord): ModelActivity {
  const row: ModelActivity = {
    model: check.model,
    purpose: "Request/settings compatibility check",
    calls: 0,
    tools: 0,
    cacheHits: 0,
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    uncachedInputTokens: null,
    cacheWriteTokens: null,
    cacheWrite5mTokens: null,
    cacheWrite1hTokens: null,
    costLow: null,
    costHigh: null,
    costBasis: "Usage unavailable or unpriced model",
  };
  const invocations = new Set<string>();
  const usages = new Set<string>();
  let unknownCost = false;
  const costSources = new Set<string>();
  for (const [index, event] of check.events.entries()) {
    const data = record(event.data);
    const id = typeof data.invocationId === "string" ? data.invocationId : `historical-${index}`;
    if (event.type === "invocation") invocations.add(id);
    if (event.type !== "usage" || usages.has(id)) continue;
    usages.add(id);
    const {
      inputTokens: input,
      outputTokens: output,
      cost,
      costBasis,
    } = jevCallUsage(typeof data.model === "string" ? data.model : check.model, data);
    if (input !== null) row.inputTokens = (row.inputTokens ?? 0) + input;
    if (output !== null) row.outputTokens = (row.outputTokens ?? 0) + output;
    if (cost === null) unknownCost = true;
    else {
      costSources.add(costBasis === "SDK reported cost" ? "reported" : "estimated");
      row.costLow = (row.costLow ?? 0) + cost;
      row.costHigh = row.costLow;
    }
  }
  row.calls = Math.max(invocations.size, usages.size);
  if (row.costLow !== null)
    row.costBasis =
      unknownCost || invocations.size > usages.size
        ? "Known subtotal · usage missing for some calls"
        : costSources.size > 1
          ? "Known subtotal · mixed reported and estimated cost"
          : costSources.has("reported")
            ? "SDK reported cost"
            : "JEV API estimate · input tokens; output free";
  const calls = recordedJevCalls(
    check.events.map((event) => ({ ...event, time: check.startedAt })),
    { defaultModel: check.model, defaultPurpose: row.purpose },
  );
  if (calls.length)
    row.jevCalls = calls.map(({ model: _model, ...call }) => ({
      ...call,
      id: `${check.id}:${call.id}`,
      status: check.status === "checking" ? call.status : check.status,
    }));
  return row;
}
