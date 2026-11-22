import { z } from "zod";
import type { ComponentRegistry } from "../shared/types";
import type { AuthoringResource } from "../../../../shared/agents/authoring-resources";

export const animateUiRegistry: ComponentRegistry = {
  id: "animate-ui",
  displayName: "Animate UI",
  url: "https://animate-ui.com/r/",
  licenseUrl: "https://raw.githubusercontent.com/imskyleen/animate-ui/main/LICENSE.md",
  itemName: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
};
// Source: https://animate-ui.com/r/registry.json
// Source: https://github.com/imskyleen/animate-ui
// Source: Installed node_modules/@animate-ui/react/package.json
// Source: animate-ui/tools.ts and shared/component-registry-tools.ts
export const animateUiAuthoring: AuthoringResource = {
  id: "animate_ui",
  name: "Animate UI",
  kind: "capability",
  guidance: `Best fit: Animated icons, compact controls, typed code blocks and specific UI transitions.
Strength: Reuses coherent micro-interactions from the Animate UI registry.
Trade-off: Requires compatible React dependencies. Router, pointer and hover effects need adaptation for video. Custom 3D or mechanical scenes gain little from it.`,
};
