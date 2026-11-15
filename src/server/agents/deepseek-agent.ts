import { attachDeepSeekCost, readDeepSeekCosts } from "./deepseek/cost-meter";
import {
  DeepSeekHarness,
  type DeepSeekHarnessOptions,
  type SdkPromptContentBlock,
  type SdkEncodedImageBlock,
} from "@deepseek-ai/dsh-sdk-client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { credentialEnvironmentVariables } from "../runtime/credential-environment";
import { systemEnvironment } from "../runtime/platform";
import { projectRuntimeEnvironment } from "../runtime/project-files";
import { safeMessage } from "../runtime/config";
import { prepareDeepSeekConfiguration } from "./deepseek/configuration";
import { deepseekEvents } from "./deepseek/events";
import type { Agent, ProviderEvent } from "./agent";

export const deepseekAgent: Agent = {
  provider: "deepseek",
  async run(options) {
    options.signal.throwIfAborted();
    if (options.planMode)
      throw Error(
        "DeepSeek uses Kiteva's read-only planning stage; native plan mode is unsupported.",
      );
    const { home, patchFile, costFile } = await prepareDeepSeekConfiguration(options);
    options.signal.throwIfAborted();
    const harness = new DeepSeekHarness({
      cwd: options.workspace,
      processCwd: options.workspace,
      dshHome: home,
      profile: "sdk",
      patches: [patchFile],
      provider: "deepseek-official",
      model: options.model,
      ...(options.reasoningEffort
        ? {
            reasoningEffort: { low: "low", medium: "high", high: "high", xhigh: "max" }[
              options.reasoningEffort
            ] as DeepSeekHarnessOptions["reasoningEffort"],
          }
        : {}),
      env: {
        ...systemEnvironment(),
        ...projectRuntimeEnvironment(options.workspace, "agent"),
        DSH_HOME: home,
        DSH_AGENTS_HOME: path.join(home, "agents"),
        DSH_TELEMETRY_DISABLED: "1",
        DSH_MAX_TOKENS_AS_SUCCESS: "false",
        ...(process.env[credentialEnvironmentVariables.deepseekApiKey]
          ? { DEEPSEEK_API_KEY: process.env[credentialEnvironmentVariables.deepseekApiKey] }
          : {}),
        ...(process.env[credentialEnvironmentVariables.anysearchApiKey]
          ? { ANYSEARCH_API_KEY: process.env[credentialEnvironmentVariables.anysearchApiKey] }
          : {}),
      },
      onUserQuestion: async () => ({ cancelled: true }),
    });
    const usageEvents = new Map<string, ProviderEvent>();
    let closing: Promise<void> | undefined;
    const close = () => (closing ??= harness.close());
    const abort = () => {
      void close().catch(() => {});
    };
    options.signal.addEventListener("abort", abort, { once: true });
    try {
      options.signal.throwIfAborted();
      await harness.start();
      options.signal.throwIfAborted();
      const session = options.sessionId
        ? await harness.resumeSession(options.sessionId)
        : harness.session();
      // Resuming preserves the immutable session origin, not this revision's
      // directory. Explicitly move future tools to the current authored workspace.
      if (options.sessionId) await session.setWorkingDirectory(options.workspace);
      options.signal.throwIfAborted();
      options.onEvent({
        type: "session",
        message: "DeepSeek session opened",
        data: { sessionId: session.id },
      });
      const blocks: SdkPromptContentBlock[] = [
        {
          type: "text",
          text: `${options.prompt}\n\nReturn only JSON matching this output schema:\n${JSON.stringify(options.jsonSchema)}`,
        },
      ];
      for (const file of options.images || []) {
        const extension = path.extname(file).toLowerCase();
        const imageTypes: Record<string, SdkEncodedImageBlock["mimeType"]> = {
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".webp": "image/webp",
        };
        const mimeType = imageTypes[extension];
        if (!mimeType) throw Error("DeepSeek image input requires PNG, JPEG or WebP.");
        blocks.push({
          type: "image",
          data: (await readFile(file, { signal: options.signal })).toString("base64"),
          mimeType,
        });
      }
      const result = await session.run(blocks, {
        onNotification: (notification) => {
          for (const event of deepseekEvents(notification)) {
            if (event.type === "usage") {
              const id = (event.data as { usageId: string }).usageId;
              if (!usageEvents.has(id)) usageEvents.set(id, event);
            } else options.onEvent({ ...event, message: safeMessage(event.message) });
          }
        },
      });
      options.signal.throwIfAborted();
      if (result.finishReason !== "completed")
        throw Error(
          `DeepSeek turn did not complete (${result.finishReason || "unknown outcome"}).`,
        );
      return { result: JSON.parse(result.finalResponse), sessionId: result.sessionId };
    } catch (error) {
      options.signal.throwIfAborted();
      throw Error(safeMessage(error));
    } finally {
      options.signal.removeEventListener("abort", abort);
      try {
        await close();
      } finally {
        const costs = await readDeepSeekCosts(costFile).catch(() => {
          options.onEvent({
            type: "warning",
            message:
              "DeepSeek cost-plugin records were unavailable or invalid; monetary cost remains unknown.",
          });
          return new Map();
        });
        if (costFile && [...usageEvents.keys()].some((id) => !costs.has(id)))
          options.onEvent({
            type: "warning",
            message:
              "Some DeepSeek calls have no matching cost-plugin record; their monetary cost remains unknown.",
          });
        for (const event of usageEvents.values()) options.onEvent(attachDeepSeekCost(event, costs));
      }
    }
  },
};
