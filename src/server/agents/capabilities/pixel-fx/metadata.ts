import type { AuthoringResource } from "../../../../shared/agents/authoring-resources";

export const pixelFxAuthoring = {
  id: "pixel_fx",
  name: "PixelFX environment effects",
  kind: "capability",
  guidance:
    "Use for pixel-art weather and ambient effects such as fog, rain, fireflies, waterfalls and torchlight. Transparent seeded sheets suit fixed-time playback. The tool supplies effects to layer into a scene.",
} as const satisfies AuthoringResource;

export const pixelFxTools = ["list_effects", "render_effect"];
