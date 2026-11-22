import type { AuthoringResource } from "../../../shared/agents/authoring-resources";
import { anatomySkill } from "./anatomy";

// Source: https://github.com/wheresryan22/anatomy.git
// Source: .agents/skills/anatomy/SKILL.md
// Source: bundled-skills/anatomy-prompt.ts
export const anatomyAuthoring: AuthoringResource = {
  id: anatomySkill.id,
  name: anatomySkill.name,
  kind: "bundled_skill",
  guidance: `Best fit: Technical mechanisms, cutaways, instruments and exploded views in consistent isometric geometry.
Strength: Reuses a framework-free SVG/HTML kit and geometry, depth and collision audits.
Trade-off: Needs authored mechanical detail and seekable animation. Optional WebGL needs verification. Offers little for standard UI or matching the appearance of a photographed object.`,
};
