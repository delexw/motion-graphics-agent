import type { AuthoringResource } from "../../../shared/agents/authoring-resources";
import { img2threejsSkill } from "./img2threejs";

export const img2threejsAuthoring: AuthoringResource = {
  id: img2threejsSkill.id,
  name: img2threejsSkill.name,
  kind: "bundled_skill",
  guidance: `Best fit: Reconstructing a specific pictured object for 3D viewpoints, turntables or part animation.
Strength: Produces editable Three.js geometry with named parts and browser review against the source image.
Trade-off: Requires a usable image, Python and Three.js setup, and manual reconstruction. Unseen surfaces are inferred. Unreferenced procedural scenes gain little from reconstruction.`,
};
