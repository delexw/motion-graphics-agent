import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { geminiCarbonModel } from "../../shared/agent-providers";
import type { ModelEffort } from "../../shared/model-effort";
import { RetryBudget } from "../../shared/retry-budget";
import { WorkQueue } from "../jobs/queue";
import { safeMessage } from "../runtime/config";
import { withProcessScope } from "../runtime/process-scope";
import {
  agentExecutionSignal,
  type Agent,
  type AgentExecutionOptions,
  type ProviderEvent,
} from "./agent";
import { ModelCapacityError } from "./capacity-error";
import {
  prepareAgyCliConfiguration,
  prepareGeminiConfiguration,
  resolveGeminiTransport,
} from "./gemini/configuration";
import { geminiEvents, parseAgyStreamEvent } from "./gemini/events";
import type { GeminiEffort } from "./model-effort-levels";

// Antigravity CLI turns share the signed-in user's conversation database.
const agyConversationQueue = new WorkQueue(1);
const agyStartupRetryDelaysMs = [1_000, 2_000, 4_000] as const;
const agyConversationStartupFailure =
  "failed to start conversation: backend returned an empty conversation id";
class AgyConversationStartupError extends Error {}

const geminiEffortAliases = {
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "xhigh",
  ultra: "xhigh",
} as const satisfies Record<ModelEffort, GeminiEffort>;

export function geminiNativeEffort(effort?: ModelEffort, model?: string): GeminiEffort | undefined {
  if (!effort) return undefined;
  const mapped = geminiEffortAliases[effort];
  if (model === geminiCarbonModel && mapped === "xhigh") return "high";
  return mapped;
}

interface BridgeResultMessage {
  ok: boolean;
  conversationId?: string | null;
  structuredOutput?: unknown;
  text?: string;
}

interface BridgeErrorMessage {
  code?: string;
  message: string;
}

function isCapacityMessage(message: string) {
  const lower = message.toLowerCase();
  return ["resource_exhausted", "quota", "429", "rate limit", "overloaded", "capacity"].some(
    (marker) => lower.includes(marker),
  );
}

function parseJsonResult(result: BridgeResultMessage): unknown {
  if (result.structuredOutput !== undefined && result.structuredOutput !== null) {
    return result.structuredOutput;
  }
  const text = typeof result.text === "string" ? result.text.trim() : "";
  if (!text) throw Error("Gemini returned an empty response.");
  return JSON.parse(text);
}

async function runViaPythonSdk(
  options: AgentExecutionOptions,
  effort?: GeminiEffort,
): Promise<{ result: unknown; sessionId?: string }> {
  const prepared = await prepareGeminiConfiguration(options, effort);
  options.signal.throwIfAborted();

  const usageEvents = new Map<string, ProviderEvent>();
  let sessionId = options.sessionId;
  let finalResult: BridgeResultMessage | undefined;
  let bridgeError: BridgeErrorMessage | undefined;
  let stderrText = "";
  let protocolError: Error | undefined;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed: Record<string, unknown>;
    try {
      const value = JSON.parse(trimmed);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        protocolError ??= Error("Gemini bridge emitted a non-object JSON line.");
        return;
      }
      parsed = value as Record<string, unknown>;
    } catch {
      protocolError ??= Error(`Gemini bridge emitted malformed JSON: ${trimmed.slice(0, 200)}`);
      return;
    }

    if (parsed.type === "result") {
      finalResult = {
        ok: Boolean(parsed.ok),
        conversationId:
          typeof parsed.conversationId === "string" ? parsed.conversationId : undefined,
        structuredOutput: parsed.structuredOutput,
        text: typeof parsed.text === "string" ? parsed.text : undefined,
      };
      if (finalResult.conversationId) sessionId = finalResult.conversationId;
      return;
    }

    if (parsed.type === "error") {
      bridgeError = {
        code: typeof parsed.code === "string" ? parsed.code : undefined,
        message:
          typeof parsed.message === "string" && parsed.message.trim()
            ? parsed.message
            : "Gemini bridge failed.",
      };
      return;
    }

    for (const event of geminiEvents(parsed)) {
      if (event.type === "session") {
        const id = (event.data as { sessionId?: string } | undefined)?.sessionId;
        if (id) sessionId = id;
      }
      if (event.type === "usage") {
        const id =
          (event.data as { usageId?: string } | undefined)?.usageId ||
          `gemini:usage:${usageEvents.size + 1}`;
        if (!usageEvents.has(id)) usageEvents.set(id, event);
      } else {
        options.onEvent({ ...event, message: safeMessage(event.message) });
      }
    }
  };

  try {
    const exitCode = await withProcessScope(options.signal, (scopedSignal) => {
      return new Promise<number>((resolve, reject) => {
        const child = spawn(prepared.pythonBin, [prepared.bridgeScript], {
          cwd: options.workspace,
          env: prepared.env,
          stdio: ["pipe", "pipe", "pipe"],
        });

        let buffer = "";
        const onAbort = () => {
          child.stdin?.end();
        };
        scopedSignal.addEventListener("abort", onAbort, { once: true });

        child.stdout?.on("data", (chunk: Buffer) => {
          buffer += chunk.toString("utf8");
          for (;;) {
            const newline = buffer.indexOf("\n");
            if (newline === -1) break;
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            handleLine(line);
          }
        });

        child.stderr?.on("data", (chunk: Buffer) => {
          if (stderrText.length < 16_000) stderrText += chunk.toString("utf8");
        });

        child.once("error", (error) => {
          scopedSignal.removeEventListener("abort", onAbort);
          reject(
            Error(
              `Failed to start Gemini Python bridge (${prepared.pythonBin}): ${safeMessage(error)}`,
            ),
          );
        });

        child.once("close", (code, signalName) => {
          scopedSignal.removeEventListener("abort", onAbort);
          if (buffer.trim()) handleLine(buffer);
          if (scopedSignal.aborted) {
            reject(scopedSignal.reason ?? Error("Gemini bridge cancelled"));
            return;
          }
          if (code === null) {
            reject(Error(`Gemini bridge terminated by signal ${signalName || "unknown"}`));
            return;
          }
          resolve(code);
        });

        child.stdin?.on("error", () => {});
        child.stdin?.end(JSON.stringify(prepared.payload));
      });
    });

    options.signal.throwIfAborted();
    if (bridgeError) {
      const message = safeMessage(bridgeError.message);
      if (bridgeError.code === "model_capacity" || isCapacityMessage(message)) {
        throw new ModelCapacityError(message, "gemini");
      }
      throw Error(message);
    }
    if (protocolError) throw protocolError;
    if (exitCode !== 0) {
      const detail = stderrText.trim() ? `: ${safeMessage(stderrText.trim())}` : "";
      throw Error(`Gemini bridge exited with code ${exitCode}${detail}`);
    }
    if (!finalResult || !finalResult.ok) {
      throw Error("Gemini turn did not complete.");
    }
    return {
      result: parseJsonResult(finalResult),
      sessionId: finalResult.conversationId || sessionId,
    };
  } catch (error) {
    options.signal.throwIfAborted();
    if (error instanceof ModelCapacityError) throw error;
    throw Error(safeMessage(error));
  } finally {
    for (const event of usageEvents.values()) options.onEvent(event);
  }
}

async function runViaAgyCli(
  options: AgentExecutionOptions,
  effort?: GeminiEffort,
): Promise<{ result: unknown; sessionId?: string }> {
  const prepared = await prepareAgyCliConfiguration(options, effort);

  const emittedStepUsageIds = new Set<string>();
  let fallbackResultUsage: ProviderEvent | undefined;
  let sessionId = options.sessionId;
  let emittedSession = false;
  let streamedText = "";
  let finalResult: BridgeResultMessage | undefined;
  let cliError: string | undefined;
  let stderrText = "";
  let toolActivityStarted = false;

  const emitSessionOnce = (id?: string) => {
    if (!id) return;
    sessionId = id;
    if (!emittedSession) {
      emittedSession = true;
      options.onEvent({
        type: "session",
        message: "Gemini session opened",
        data: { sessionId: id },
      });
    }
  };

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(trimmed);
    } catch {
      // agy may emit non-JSON startup notices on stdout; ignore them safely.
      return;
    }
    const parsed = parseAgyStreamEvent(parsedJson, options.model);
    if (parsed.conversationId) emitSessionOnce(parsed.conversationId);
    if (parsed.textDelta) streamedText += parsed.textDelta;
    for (const event of parsed.events) {
      if (event.type === "tool" || event.type === "tool_result") toolActivityStarted = true;
      if (event.type === "session") {
        const id = (event.data as { sessionId?: string } | undefined)?.sessionId;
        emitSessionOnce(id);
        continue;
      }
      if (event.type === "usage") {
        const data = event.data as { usageId?: string; usageSource?: string } | undefined;
        if (data?.usageSource === "step") {
          const id = data.usageId || `gemini:cli:step:${emittedStepUsageIds.size + 1}`;
          if (!emittedStepUsageIds.has(id)) {
            emittedStepUsageIds.add(id);
            options.onEvent(event);
          }
        } else {
          // Result usage is cumulative across the session; emit only if no per-step usage arrived.
          fallbackResultUsage = event;
        }
      } else {
        options.onEvent({ ...event, message: safeMessage(event.message) });
      }
    }
    if (parsed.error) cliError = parsed.error.message;
    if (parsed.result) {
      if (parsed.result.ok) {
        finalResult = {
          ok: true,
          conversationId: parsed.result.conversationId || sessionId,
          structuredOutput: parsed.result.structuredOutput,
          text: parsed.result.text ?? streamedText,
        };
      } else {
        cliError = parsed.result.error || "Antigravity CLI turn did not complete.";
      }
    }
  };

  try {
    options.signal.throwIfAborted();
    const exitCode = await withProcessScope(options.signal, (scopedSignal) => {
      return new Promise<number>((resolve, reject) => {
        const child = spawn(prepared.agyBin, prepared.args, {
          cwd: options.workspace,
          env: prepared.env,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let buffer = "";
        child.stdout?.on("data", (chunk: Buffer) => {
          buffer += chunk.toString("utf8");
          for (;;) {
            const newline = buffer.indexOf("\n");
            if (newline === -1) break;
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            handleLine(line);
          }
        });

        child.stderr?.on("data", (chunk: Buffer) => {
          if (stderrText.length < 16_000) stderrText += chunk.toString("utf8");
        });

        child.once("error", (error) => {
          reject(
            Error(`Failed to start Antigravity CLI (${prepared.agyBin}): ${safeMessage(error)}`),
          );
        });

        child.once("close", (code, signalName) => {
          if (buffer.trim()) handleLine(buffer);
          if (scopedSignal.aborted) {
            reject(scopedSignal.reason ?? Error("Antigravity CLI cancelled"));
            return;
          }
          if (code === null) {
            reject(Error(`Antigravity CLI terminated by signal ${signalName || "unknown"}`));
            return;
          }
          resolve(code);
        });
      });
    });

    options.signal.throwIfAborted();
    if (cliError || exitCode !== 0) {
      const detail = stderrText.trim() ? `: ${safeMessage(stderrText.trim())}` : "";
      const message = cliError
        ? safeMessage(cliError)
        : `Antigravity CLI exited with code ${exitCode}${detail}`;
      if (
        !sessionId &&
        !streamedText.trim() &&
        !emittedStepUsageIds.size &&
        !toolActivityStarted &&
        !finalResult &&
        message.toLowerCase().includes(agyConversationStartupFailure)
      )
        throw new AgyConversationStartupError(message);
      if (isCapacityMessage(message)) throw new ModelCapacityError(message, "gemini");
      throw Error(message);
    }
    const resolvedResult: BridgeResultMessage = finalResult ?? {
      ok: Boolean(streamedText.trim()),
      conversationId: sessionId,
      text: streamedText,
    };
    if (!resolvedResult.ok) {
      throw Error("Antigravity CLI turn did not complete.");
    }
    return {
      result: parseJsonResult(resolvedResult),
      sessionId: resolvedResult.conversationId || sessionId,
    };
  } catch (error) {
    options.signal.throwIfAborted();
    if (error instanceof ModelCapacityError || error instanceof AgyConversationStartupError)
      throw error;
    throw Error(safeMessage(error));
  } finally {
    await prepared.cleanup();
    if (!emittedStepUsageIds.size && fallbackResultUsage) {
      options.onEvent(fallbackResultUsage);
    }
  }
}

async function runAgyWithStartupRetry(options: AgentExecutionOptions, effort?: GeminiEffort) {
  for (const { index, number, remaining } of new RetryBudget(agyStartupRetryDelaysMs.length + 1)) {
    options.signal.throwIfAborted();
    try {
      return await runViaAgyCli(options, effort);
    } catch (error) {
      options.signal.throwIfAborted();
      if (!(error instanceof AgyConversationStartupError) || !remaining) throw error;
      const delayMs = agyStartupRetryDelaysMs[index];
      options.onEvent({
        type: "retry",
        message: `Gemini could not open a conversation. Retrying startup (${number}/${agyStartupRetryDelaysMs.length})…`,
        data: { reason: "gemini_conversation_start", retry: number, delayMs },
      });
      await delay(delayMs, undefined, { signal: options.signal });
    }
  }
  throw Error("Gemini conversation startup retry budget exhausted");
}

export const geminiAgent: Agent = {
  provider: "gemini",
  async run(options) {
    options.signal.throwIfAborted();
    if (options.planMode) {
      throw Error(
        "Gemini uses Kiteva's read-only planning stage; native plan mode is unsupported.",
      );
    }
    const effort = geminiNativeEffort(options.reasoningEffort, options.model);
    const transport = resolveGeminiTransport();
    const run = () => {
      const execution = { ...options, signal: agentExecutionSignal(options) };
      return transport === "sdk"
        ? runViaPythonSdk(execution, effort)
        : runAgyWithStartupRetry(execution, effort);
    };
    return transport === "sdk" ? run() : agyConversationQueue.run(run, options.signal);
  },
};
