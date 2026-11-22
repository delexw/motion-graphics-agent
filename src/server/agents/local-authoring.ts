import type { AuthoringResource } from "../../shared/agents/authoring-resources";

// Source: package.json
// Source: node_modules/*/package.json
// Source: rendering/renderer-metadata.ts
export const localAuthoring: AuthoringResource = {
  id: "local_code",
  name: "Existing local code and libraries",
  kind: "local_code",
  guidance: `Best fit: Custom layouts, exact typography, diagrams, simple scenes and titles over supplied footage.
Strength: Direct control over visuals and composition time with existing renderer-compatible code and libraries.
Trade-off: The agent authors and verifies every effect. A matching component, technical kit or simulation engine may reduce work or improve fidelity.`,
};
