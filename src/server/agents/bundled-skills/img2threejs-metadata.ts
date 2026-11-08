import type { AuthoringResource } from "../../../shared/agents/authoring-resources";
import { img2threejsSkill } from "./img2threejs";

export const img2threejsAuthoring: AuthoringResource = {
  id: img2threejsSkill.id,
  name: img2threejsSkill.name,
  kind: "bundled_skill",
  guidance: `img2threejs

What it provides: Agent-led reference-image reconstruction into editable procedural Three.js factories, ObjectSculptSpec, named parts/pivots/sockets and staged browser-image review.

Advantages / best fit:
- A particular pictured product, prop or stylized object whose silhouette, materials and recognizable details matter
- Real 3D viewpoints, turntables and articulated or exploded objects driven by named parts
- Source-to-render evidence and explicit reconstruction limitations

Disadvantages / poor fit:
- No usable subject reference, ordinary UI, flat typography or decorative effects
- Explanatory diagrams better expressed as Anatomy isometric mechanisms
- Guaranteed hidden-side fidelity, photogrammetry or turnkey realistic/skinned character animation

Implementation costs and constraints:
- Inspect the supplied image and installed SKILL.md; use Python 3.10+ forge tooling and project-local Three.js/addons
- Model parts require authored geometry/material specifications, actual browser captures and bounded corrections
- Single-view hidden surfaces are inferred; some workflows use declared reference-derived textures
- Optional character plugins and hosted adapters are separate scopes; installer availability is not runtime readiness

Video adaptation:
- Use the staged procedural-model controller for absolute composition time, transform reset and owned-resource cleanup
- Keep the existing renderer, palette and scene camera; disable standalone controls and wall-clock simulation
- Inspect real saved views, direct/backward seeks and final export; a generated group is not a complete animated film

Does not provide:
- A new export renderer, soundtrack, automatic whole-film direction or exact reconstruction guarantee

Choose when: Reconstructing a specific pictured object is central to the requested result. Compare against Anatomy for a concept explained through a technical mechanism, and local code when neither specialized skill adds useful fidelity. Honor explicit compatible requests; do not choose solely because Three.js or an image is mentioned.`,
};
