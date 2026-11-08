import { img2threejsSkill } from "../src/server/agents/bundled-skills/img2threejs";
import { expect, it } from "vitest";
import { bundledSkills, bundledSkillsGuidance } from "../src/server/agents/bundled-skills/registry";
import { anatomySkill } from "../src/server/agents/bundled-skills/anatomy";
import { anatomyPrompt } from "../src/server/agents/bundled-skills/anatomy-prompt";
import { claudeBundledSkills } from "../src/server/agents/bundled-skills";

it("uses each skill registration for both prompt assembly and native Claude discovery", () => {
  expect(bundledSkills).toContain(anatomySkill);
  expect(new Set(bundledSkills.map((skill) => skill.id)).size).toBe(bundledSkills.length);
  expect(new Set(bundledSkills.map((skill) => skill.claudeName)).size).toBe(bundledSkills.length);
  expect(bundledSkillsGuidance).toBe(
    bundledSkills.map((skill) => `### ${skill.name}\n\n${skill.guidance}`).join("\n\n"),
  );
  expect(claudeBundledSkills("/workspace", true).skills).toEqual(
    bundledSkills.map((skill) => skill.claudeName),
  );
  for (const skill of bundledSkills) {
    expect(skill.workspacePath).toBe(`.agents/skills/${skill.id}`);
    expect(skill.claudeName).toBe(`bundled-authoring:${skill.id}`);
    expect(skill.repository).toMatch(/^https:\/\/github.com\//);
    expect(skill.guidance).toContain(`${skill.workspacePath}/SKILL.md`);
  }
});
it("keeps Anatomy prompt metadata bound to its source registration", () => {
  expect(anatomySkill.guidance).toBe(anatomyPrompt(anatomySkill.workspacePath));
  const prompt = anatomyPrompt(".agents/skills/example");
  expect(prompt).toContain(".agents/skills/example/SKILL.md");
  expect(prompt).not.toContain("e9488296");
});

it("keeps research guidance concise and covers docs, CLI parameters, examples and source", () => {
  const skill = bundledSkills.find((s) => s.id === "anysearch")!;
  expect(skill.guidance).toContain("Use Skill(anysearch)");
  expect(skill.guidance).toContain("CLI parameters, repository examples and source code");
  expect(skill.guidance.split(/\s+/).length).toBeLessThan(40);
});

it("registers the startup-updated reconstruction skill with explicit video and evidence boundaries", () => {
  expect(bundledSkills).toContain(img2threejsSkill);
  expect(img2threejsSkill).not.toHaveProperty("revision");
  expect(img2threejsSkill.guidance).toContain("forge/next.py");
  expect(img2threejsSkill.guidance).toContain("no --allow-nonstrict in production");
  expect(img2threejsSkill.guidance).toContain("vendor/procedural-model.ts");
  expect(img2threejsSkill.guidance).toContain("hidden sides as inferred");
});
