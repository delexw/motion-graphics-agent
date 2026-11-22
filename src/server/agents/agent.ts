import type { EffortTask, ModelEffort } from "../../shared/model-effort";
import type { AgentMcpCapability } from "./capabilities/shared/types";
import type { z } from "zod";
import type { Provider } from "../../shared/contracts";

export interface ProviderEvent {
  type: string;
  message: string;
  data?: unknown;
}

export interface AgentTurnOptions<T> {
  provider: Provider;
  workspace: string;
  prompt: string;
  promptContext?: unknown;
  schema: z.ZodType<T>;
  signal: AbortSignal;
  sessionId?: string;
  onEvent: (event: ProviderEvent) => void;
  includeCreativeAlternatives?: boolean;
  readOnly?: boolean;
  planMode?: boolean;
  model?: string;
  textOnly?: boolean;
  reasoningEffort?: ModelEffort;
  effortTask?: EffortTask;
  referenceUrls?: string[];
  enableVideoCapture?: boolean;
  captureChapterId?: string;
  captureChapterDurationSeconds?: number;
  exploreBriefSections?: boolean;
  images?: string[];
}

export interface AgentExecutionOptions extends Omit<
  AgentTurnOptions<unknown>,
  "provider" | "schema" | "promptContext"
> {
  model: string;
  systemPrompt: string;
  jsonSchema: z.core.JSONSchema.BaseSchema;
  capabilityServers?: Record<string, AgentMcpCapability>;
}

export interface Agent {
  readonly provider: Provider;
  readonly defaultReasoningEffort?: AgentTurnOptions<unknown>["reasoningEffort"];
  run(options: AgentExecutionOptions): Promise<{ result: unknown; sessionId?: string }>;
}
