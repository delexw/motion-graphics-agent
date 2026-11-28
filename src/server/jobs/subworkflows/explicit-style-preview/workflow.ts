import path from "node:path";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { writeProjectRequest } from "../../../requests/project-request";
import {
  requestedStyleScopeGuidance,
  selectedStyleWeightingGuidance,
} from "../../../../shared/style-combinations";
import { z } from "zod";
import {
  CombinedStyleGuideSchema,
  combinedStyleGuidePlanning,
} from "../../../../shared/agents/schemas/combined-style-guide";
import { CandidateCopySchema } from "../../../../shared/agents/schemas/candidate-copy";
import { ProposalSchema } from "../../../../shared/agents/schemas/proposals";
import type { CreativeRequest, Style, StyleCandidate } from "../../../../shared/contracts";
import { agentTurn, type ProviderEvent } from "../../../agents/providers";
import { models } from "../../../runtime/config";
import { manualDirection } from "../../manual-direction";
import { directionCandidateId } from "../../../../shared/direction-rounds";
import { SceneBackgroundTreatmentSchema } from "../../../../shared/agents/scene-background";
import { selectSceneBackground } from "../../../jev/strategies/scene-background";
import { videoSceneBackgroundGuidance } from "../../../domains/video/scene-background";

export const ExplicitStylePreviewsSchema = z.object({
  policy: z.literal("explicit-style-previews-v2"),
  candidates: z
    .array(
      ProposalSchema.shape.options.element.extend({
        id: z.string(),
        score: z.literal(0),
        confidence: z.literal(0),
        dimensions: z.object({}).strict(),
        combinedStyleGuide: CombinedStyleGuideSchema.optional(),
        sceneBackgroundTreatment: SceneBackgroundTreatmentSchema.optional(),
      }),
    )
    .min(1)
    .max(5),
});

/** Plan creative executions of fixed user styles; neither propose nor rank style combinations. */
export async function runExplicitStylePreviewWorkflow(input: {
  request: CreativeRequest;
  styles: Style[];
  workspace: string;
  signal: AbortSignal;
  previousDirections: StyleCandidate[];
  round: number;
  onEvent: (event: ProviderEvent) => void;
}) {
  const { request, styles, workspace, signal, onEvent } = input;
  const base = manualDirection(request, styles);
  const candidateIds = Array.from({ length: request.candidateCount }, () => randomUUID());
  const sceneBackgroundTreatment =
    request.outputType === "video"
      ? await selectSceneBackground({
          request,
          styles,
          signal,
          onEvent,
          kind: "preview",
          candidate: base,
          previewCandidateIds: candidateIds.map((id) => directionCandidateId(input.round, id)),
        })
      : undefined;
  const backgroundGuidance = videoSceneBackgroundGuidance(sceneBackgroundTreatment);
  const requestFile = await writeProjectRequest(workspace, request);
  const guidanceFile = path.resolve(workspace, "PREVIEW_DIRECTION_GUIDANCE.md");
  await writeFile(
    guidanceFile,
    `${requestedStyleScopeGuidance}\n\n${selectedStyleWeightingGuidance}`,
  );
  const requiresCombinedStyleGuide =
    request.outputType !== "page" && base.supportingStyleIds.length > 0;
  const schema = z.object({
    previewBeat: z.string().min(1),
    directions: z
      .array(
        CandidateCopySchema.extend({
          sceneRoles: z.array(z.string()).min(1),
          rationale: z.string().min(1),
          combinedStyleGuide: requiresCombinedStyleGuide
            ? CombinedStyleGuideSchema
            : CombinedStyleGuideSchema.optional(),
        }),
      )
      .length(request.candidateCount),
  });
  const result = await agentTurn({
    includeCreativeAlternatives: false,
    provider: request.provider,
    model: request.mainModel || models[request.provider],
    effortTask: "planning",
    workspace,
    signal,
    onEvent,
    readOnly: true,
    referenceUrls: request.urls,
    schema,
    promptContext: {
      projectRequestFile: requestFile,
      candidate: base,
      previousDirections: input.previousDirections,
    },
    prompt: `# Preview direction planning

- Read the original idea and all settings from ${JSON.stringify(requestFile)}.
- Read ${JSON.stringify(guidanceFile)} for selected-style scope and weighting rules.
- Read the required input JSON for the fixed selected styles and previous directions; inspect relevant attachments and supplied sources.
- Choose one representative previewBeat and exactly ${request.candidateCount} distinct creative executions of that same beat. Preserve requested style scopes; vary the creative execution without proposing, ranking or changing style combinations.
${requiresCombinedStyleGuide ? `- Read the complete fixed style definitions through Creative Pool MCP. ${combinedStyleGuidePlanning}\n` : ""}- Describe each direction and its sceneRoles concretely for the builder. Keep the original idea unchanged; return the required structured output.${backgroundGuidance ? `\n\n${backgroundGuidance}` : ""}`,
  });
  const plan = schema.parse(result.value);
  return {
    policy: "explicit-style-previews-v2" as const,
    previewBeat: plan.previewBeat,
    candidates: plan.directions.map((direction, index) => ({
      ...base,
      ...direction,
      id: candidateIds[index],
      sceneBackgroundTreatment,
      score: 0 as const,
      confidence: 0 as const,
      dimensions: {},
      primaryStyleId: base.primaryStyleId,
      supportingStyleIds: base.supportingStyleIds,
    })),
  };
}
