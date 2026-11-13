import { stageshowSceneGuidance } from "./stageshow-scene-guidance";
import type { AuthoringResource } from "../../../shared/agents/authoring-resources";
import { stageshowSkill } from "./stageshow";

export const stageshowAuthoring: AuthoringResource = {
  id: stageshowSkill.id,
  name: stageshowSkill.name,
  kind: "bundled_skill",
  guidance: `Stageshow

What it provides: React/CSS product-UI kit, windows/phones, cursor interactions, state transitions, worked examples and visual rehearsal guidance. MIT source with separate third-party asset notices.

Advantages / best fit:
- Authored product walkthroughs: assignments, forms, menus, status changes and visible results
- UI-focused launch films, feature demonstrations, product illustrations and interactive pages
- Deliberate cursor choreography, readable hierarchy and coherent interaction beats

Disadvantages / poor fit:
- Required authentic application footage or proof that a real service works
- Non-UI subjects, photographed-object reconstruction or explanatory mechanical geometry
- Copying another product's brand or treating simulated UI as authentic footage

Implementation costs and constraints:
- Read the local skill and closest example; copy needed kit/CSS and preserve licenses/notices
- React/ReactDOM and sometimes icon modules must be declared as actual project dependencies
- Preserve native demo appearance unless the user specifies UI styling; selected MG supplies motion only; review asset-specific rights

Video adaptation:
- Native Stage/Act scripts and its forward-only recording clock are not arbitrary seekable timelines
- Derive every state, cursor and transition from absolute renderer time; verify direct/backward/fresh-page seeks
- Use existing film renderers; retain native playback/Replay for interactive pages when appropriate

Does not provide:
- A video renderer, real browser recording, music, narration or evidence of real application behaviour

Choose when: The subject is an authored UI demonstration whose interaction clarity benefits from this kit. Identify the demo as simulated.

${stageshowSceneGuidance}`,
};
