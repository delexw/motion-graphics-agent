import type { AuthoringResource } from "../../../../shared/agents/authoring-resources";

export const bevyAuthoring: AuthoringResource = {
  id: "bevy",
  name: "Bevy",
  kind: "capability",
  guidance: `Best fit: Dedicated 2D or 3D scenes where detailed art direction, rich lighting or fixed-step simulation is central.
Strength: Fine control over geometry, materials, lighting and camera motion for delicate detail and subtle visual effects in 2D and 3D scenes.
Trade-off: Needs Rust and a compatible GPU. Budget compile and export time for dedicated shots.`,
};
