import { z } from "zod";
import type { ComponentRegistry } from "../shared/types";
import type { AuthoringResource } from "../../../../shared/agents/authoring-resources";

export const reactBitsRegistry: ComponentRegistry = {
  id: "react-bits",
  displayName: "React Bits",
  url: "https://reactbits.dev/r/",
  licenseUrl: "https://raw.githubusercontent.com/DavidHDev/react-bits/main/LICENSE.md",
  itemName: z.string().regex(/^[A-Za-z0-9]+-(JS|TS)(?:-(CSS|TW))?$/),
};
// Source: https://reactbits.dev/r/registry.json
// Source: https://github.com/DavidHDev/react-bits
// Source: react-bits/tools.ts and shared/component-registry-tools.ts
export const reactBitsAuthoring: AuthoringResource = {
  id: "react_bits",
  name: "React Bits",
  kind: "capability",
  guidance: `Best fit: Expressive text entrances, image treatments, backgrounds, shaders and individual interface effects.
Strength: Reuses a matching visual component with editable source and selectable variants.
Trade-off: Check React, peer dependency and GPU requirements. Convert interactive or continuous motion to seekable time. Bespoke objects may need custom geometry.`,
};
