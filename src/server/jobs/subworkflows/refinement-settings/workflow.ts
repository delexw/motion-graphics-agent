import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { agentTurn, type ProviderEvent } from "../../../agents/providers";
import {
  speechEngines,
  speechVoicesForEngine,
  speechLanguage,
  mingLanguages,
  pocketLanguages,
} from "../../../../shared/speech";
import {
  RefinementSettingsPlanSchema,
  applyRefinementSettings,
} from "../../../../shared/refinement-settings";
import type { VideoRequest } from "../../../../shared/domains/video";
import { refinementSettingsGuidance } from "./prompt";
import { workspacePaths } from "../../../runtime/workspace";

export const refinementSettingsArtifact = "REFINEMENT_SETTINGS.json";
/** A separate, governed main-model strategy; no tools, downloads or TTS calls in this stage. */
export async function resolveRefinementSettings(input: {
  request: VideoRequest;
  prompt: string;
  model: string;
  workspace: string;
  signal: AbortSignal;
  onEvent: (event: ProviderEvent) => void;
}) {
  const { request, prompt, workspace, signal, onEvent } = input;
  signal.throwIfAborted();
  const schema = RefinementSettingsPlanSchema.superRefine((plan, context) => {
    try {
      applyRefinementSettings(request, plan, prompt);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
  const result = await agentTurn({
    provider: request.provider,
    model: input.model,
    workspace,
    signal,
    onEvent,
    readOnly: true,
    textOnly: true,
    schema,
    prompt: JSON.stringify({
      policy: refinementSettingsGuidance,
      request,
      latestRefinement: prompt,
      providers: speechEngines.map((engine) => ({
        id: engine.id,
        languages:
          engine.id === "ming-tts"
            ? mingLanguages
            : engine.id === "pocket-tts"
              ? pocketLanguages
              : undefined,
        voices: speechVoicesForEngine(engine.id).map((voice) => ({
          id: voice.id,
          label: voice.label,
          language: speechLanguage(voice.id, engine.id),
          ...("gender" in voice ? { gender: voice.gender } : {}),
        })),
      })),
    }),
  });
  signal.throwIfAborted();
  const plan = schema.parse(result.value);
  const effectiveRequest = applyRefinementSettings(request, plan, prompt);
  await mkdir(path.join(workspace, workspacePaths(workspace).diagnostics), { recursive: true });
  await writeFile(
    path.join(workspace, workspacePaths(workspace).diagnostics, refinementSettingsArtifact),
    JSON.stringify({ version: 1, plan, effectiveRequest }, null, 2),
    { signal },
  );
  return { plan, effectiveRequest };
}
