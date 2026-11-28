import { jevApiCost } from "./pricing/jev";
import {
  SceneBackgroundTreatmentSchema,
  sceneBackgroundPurpose,
  sceneBackgroundQuestion,
  type SceneBackgroundTreatment,
} from "./agents/scene-background";

export interface JevCallDetail {
  id: string;
  time: string;
  purpose: string;
  project?: string;
  targetModel?: string;
  selectedEffort?: string;
  backgroundTreatment?: SceneBackgroundTreatment;
  backgroundTarget?: { kind: "preview" | "full"; directions: string[]; version?: number };
  status: "recorded" | "pending" | "failed" | "cancelled" | "compatible" | "conflict";
  inputTokens: number | null;
  outputTokens: number | null;
  cost: number | null;
  costBasis: string;
  promptUrl?: string;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export function jevCallUsage(model: string, value: unknown) {
  const data = record(value);
  const usage = record(data.usage ?? data);
  const inputTokens = count(usage.input_tokens);
  const outputTokens = count(usage.output_tokens);
  const reportedCost = count(data.cost);
  const cost = reportedCost ?? (inputTokens === null ? null : jevApiCost(model, inputTokens));
  return {
    inputTokens,
    outputTokens,
    cost,
    costBasis:
      reportedCost !== null
        ? "SDK reported cost"
        : cost !== null
          ? "JEV API estimate · input tokens; output free"
          : "Not reported",
  };
}

type CallEvent = { type: string; time: string; jobId?: string; data?: unknown };

export function recordedJevCalls(
  events: CallEvent[],
  options: {
    defaultPurpose: string;
    defaultModel?: string;
    project?: string;
    projectId?: string;
    backgroundTarget?: (event: CallEvent) => JevCallDetail["backgroundTarget"];
  },
) {
  const calls = new Map<string, JevCallDetail & { model: string }>();
  const metered = new Set<string>();
  for (const event of events) {
    const data = record(event.data);
    if (typeof data.invocationId !== "string") continue;
    const id = data.invocationId;
    const existing = calls.get(id);
    const model =
      typeof data.model === "string" ? data.model : (existing?.model ?? options.defaultModel);
    if (!model || (data.provider !== "jev" && !model.startsWith("jev-"))) continue;
    if (event.type === "invocation" || event.type === "usage") {
      const call =
        existing ??
        ({
          id,
          time: event.time,
          project: options.project,
          model,
          purpose: typeof data.purpose === "string" ? data.purpose : options.defaultPurpose,
          status: "pending",
          ...jevCallUsage(model, undefined),
        } satisfies JevCallDetail & { model: string });
      if (event.type === "invocation") {
        call.time = event.time;
        if (call.purpose === sceneBackgroundPurpose)
          call.backgroundTarget = options.backgroundTarget?.(event);
        if (typeof data.targetModel === "string") call.targetModel = data.targetModel;
        if (data.prompt && options.projectId)
          call.promptUrl = `/api/admin/governance/${encodeURIComponent(options.projectId)}/prompts/${encodeURIComponent(id)}`;
      } else if (!metered.has(id)) {
        metered.add(id);
        call.model = model;
        if (call.status === "pending") call.status = "recorded";
        Object.assign(call, jevCallUsage(model, data));
        const decision = record(data.decision);
        const selected = record(decision.answer).choice;
        if (
          call.status === "recorded" &&
          decision.questionKey === "effort" &&
          typeof selected === "string"
        )
          call.selectedEffort = selected;
        if (
          call.purpose === sceneBackgroundPurpose &&
          decision.questionKey === sceneBackgroundQuestion
        )
          call.backgroundTreatment = SceneBackgroundTreatmentSchema.safeParse(selected).data;
      }
      calls.set(id, call);
    } else if (existing && (data.outcome === "cancelled" || data.outcome === "failed")) {
      existing.status = data.outcome;
      delete existing.selectedEffort;
      delete existing.backgroundTreatment;
    }
  }
  return [...calls.values()];
}
