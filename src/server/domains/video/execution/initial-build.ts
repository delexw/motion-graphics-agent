import path from "node:path";
import type { Style, StyleCandidate } from "../../../../shared/contracts";
import { previewPlanArtifact } from "../../../jobs/preview-plan";
import { prepareVideoBuildPlan } from "../build-plan";
import { videoBuildGuide } from "./build-guide";
import { executeImplementationHandoff } from "./implementation-handoff";
import type { VideoExecutionInput } from "./types";

/** Build an initial preview or full film from its approved planning inputs. */
export async function executeInitialBuild(
  input: VideoExecutionInput & {
    candidate: StyleCandidate;
    styles: readonly Style[];
  },
) {
  const { planning, candidate, styles } = input;
  const { job, request, width, height, fps } = planning;
  const handoff =
    job.kind === "preview"
      ? `# Build this preview

- Read ${JSON.stringify(path.resolve(job.workspace, previewPlanArtifact))} for the shared plan and direction ${JSON.stringify(candidate.id)}. Implement only that direction's assigned styles and scene roles.
- Build the short silent preview directly.
- Return the production manifest with the complete storyboard, displayTitle and displayDescription. The app validates and renders the result.`
      : await prepareVideoBuildPlan(planning);
  const guide = videoBuildGuide({ job, candidate, request, styles, width, height, fps });
  const references = `# Supporting references

Read VIDEO_REQUIREMENTS.md before coding for the original idea, supplied assets, approved wording and required workflow, tool and renderer contracts. Use style-context.json for the supplied references and exact idea. Use the saved plan for assigned scene roles and STORYBOARD.json for the storyboard when available. Preserve the original idea and the approved storyboard while applying the guide.

${handoff}`;
  await executeImplementationHandoff(input, guide + references);
}
