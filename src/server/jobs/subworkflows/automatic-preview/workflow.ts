import { z } from "zod";
import {
  CombinedStyleGuideSchema,
  combinedStyleGuidePlanning,
} from "../../../../shared/agents/schemas/combined-style-guide";
import { CandidateCopySchema } from "../../../../shared/agents/schemas/candidate-copy";
import type {
  ContentBrief,
  CreativeRequest,
  Style,
  StyleCandidate,
} from "../../../../shared/contracts";
import { SceneBackgroundTreatmentSchema } from "../../../../shared/agents/scene-background";
import { requestedStyleScopeGuidance } from "../../../../shared/style-combinations";
import { writeProjectRequest } from "../../../requests/project-request";
import { fileBackedPlanningPrompt } from "../../../agents/planning-prompt";
import { agentTurn, type ProviderEvent } from "../../../agents/providers";
import { models } from "../../../runtime/config";
import { selectSceneBackground } from "../../../jev/strategies/scene-background";
import { videoSceneBackgroundGuidance } from "../../../domains/video/scene-background";

export const AutomaticPreviewPlanSchema = z.object({
  previewBeat: z.string().min(1),
  directions: z
    .array(
      CandidateCopySchema.extend({
        id: z.string(),
        sceneRoles: z.array(z.string()).min(1),
        rationale: z.string().min(1),
        combinedStyleGuide: CombinedStyleGuideSchema.optional(),
      }),
    )
    .min(1)
    .max(5),
});
export const SavedAutomaticPreviewPlanSchema = AutomaticPreviewPlanSchema.extend({
  directions: AutomaticPreviewPlanSchema.shape.directions.element
    .extend({ sceneBackgroundTreatment: SceneBackgroundTreatmentSchema.optional() })
    .array()
    .min(1)
    .max(5),
});

/** One model plans the shared beat and every fixed direction after pool selection. */
export async function runAutomaticPreviewWorkflow(input: {
  request: CreativeRequest;
  brief: ContentBrief;
  candidates: StyleCandidate[];
  styles: readonly Style[];
  workspace: string;
  signal: AbortSignal;
  onEvent: (event: ProviderEvent) => void;
}) {
  input.signal.throwIfAborted();
  const combinedDirections = new Set(
    input.candidates.filter((candidate) => candidate.supportingStyleIds.length).map(({ id }) => id),
  );
  const request = input.request;
  const treatments = await Promise.all(
    input.candidates.map(async (candidate) =>
      request.outputType === "video"
        ? selectSceneBackground({
            ...input,
            request,
            kind: "preview",
            candidate,
            previewCandidateIds: [candidate.id],
          })
        : undefined,
    ),
  );
  const treatmentById = new Map(input.candidates.map(({ id }, index) => [id, treatments[index]]));
  const backgroundGuidance = input.candidates
    .map(({ id }) =>
      videoSceneBackgroundGuidance(treatmentById.get(id), `Scene backgrounds for ${id}`),
    )
    .filter(Boolean)
    .join("\n\n");
  const requestFile = await writeProjectRequest(input.workspace, input.request);
  const result = await agentTurn({
    provider: input.request.provider,
    model: input.request.mainModel || models[input.request.provider],
    effortTask: "planning",
    workspace: input.workspace,
    signal: input.signal,
    readOnly: true,
    referenceUrls: input.request.urls,
    includeCreativeAlternatives: false,
    schema: AutomaticPreviewPlanSchema,
    onEvent: input.onEvent,
    promptContext: {
      projectRequestFile: requestFile,
      brief: input.brief,
      directions: input.candidates,
    },
    prompt: await fileBackedPlanningPrompt(
      input.workspace,
      "PREVIEW_PLANNING.md",
      `# Shared preview planning

## Inputs
- Read ${JSON.stringify(requestFile)} for the original idea and settings.
- Read the required input JSON for the prepared brief and fixed selected directions.
- Read the selected styles through Creative Pool MCP before planning their execution.

## Plan
- Choose one representative three-second previewBeat and plan its execution for every supplied direction in this single response.
- Give each direction readable names, a concise rationale and sceneRoles describing its preview sequence, visual treatment and motion. Preserve the subject and factual message across directions.
${combinedDirections.size ? `- ${combinedStyleGuidePlanning}\n` : ""}
- Keep every supplied direction ID and style combination unchanged. Style selection is already complete; do not redraw, rank, replace or add styles. ${requestedStyleScopeGuidance}
- Preserve the original idea and embedded references. If an optional reference cannot be accessed, record the limitation and continue from the original idea and verified material.
- Plan only; do not implement, render or create a full-video storyboard. Return exactly one entry for each supplied direction ID.${backgroundGuidance ? `\n\n${backgroundGuidance}` : ""}`,
    ),
  });
  const plan = AutomaticPreviewPlanSchema.parse(result.value);
  validateAutomaticPreviewPlan(plan, input.candidates);
  for (const direction of plan.directions) {
    if (combinedDirections.has(direction.id) && !direction.combinedStyleGuide)
      throw Error(`Preview direction ${direction.id} requires an 11-section combined style guide.`);
  }
  return {
    ...plan,
    directions: plan.directions.map((direction) => ({
      ...direction,
      sceneBackgroundTreatment: treatmentById.get(direction.id),
    })),
  };
}

export function validateAutomaticPreviewPlan(
  plan: z.infer<typeof AutomaticPreviewPlanSchema>,
  candidates: readonly StyleCandidate[],
) {
  const ids = new Set(plan.directions.map((direction) => direction.id));
  if (
    ids.size !== candidates.length ||
    plan.directions.length !== candidates.length ||
    candidates.some((candidate) => !ids.has(candidate.id))
  )
    throw Error("Preview planning must preserve every selected direction ID exactly once.");
}
