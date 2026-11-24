import type { AuthoringResource } from "../../../../shared/agents/authoring-resources";

export const lpcAuthoring = {
  id: "lpc",
  name: "LPC characters",
  kind: "capability",
  guidance:
    "Use for modular LPC-style pixel characters, costumes and animation sheets. Verified CC0 or CC BY layers include the male, female, teen and child stock bases available under CC BY 3.0. Match the scene's pixel scale and check catalogue coverage for the desired character.",
} as const satisfies AuthoringResource;

export const lpcTools = ["list_parts", "build_character"];
