import type { AuthoringResource } from "../../../shared/agents/authoring-resources";
import { stageshowSkill } from "./stageshow";

export const stageshowAuthoring: AuthoringResource = {
  id: stageshowSkill.id,
  name: stageshowSkill.name,
  kind: "bundled_skill",
  guidance: `Best fit: Simulated product walkthroughs, feature demos and interfaces with deliberate cursor choreography.
Strength: Reuses React/CSS layouts, native demo styling and authored interaction states.
Trade-off: Video needs seekable states. Authentic product footage requires a recording. Keep the demo appearance unless the brief specifies UI styling. Selected Motion Graphics supply motion within the demo.`,
};
