# Bundled skills

`src/server/agents/bundled-skills/registry.ts` is the explicit skill registry.
Read `src/server/agents/bundled-skills/README.md`, `types.ts` and the installer before
changing installation, selection or workspace staging.

- Give each skill its own registration and guidance module. Keep upstream source,
  identity, purpose, workspace path and selection metadata with that skill.
- Register through `bundledSkills`; reuse shared installation and staging. Do not
  discover user-global skills or duplicate policy separately for each provider.
- Claude and Codex receive the same verified skill files and common guidance.
  Keep provider adapters limited to their supported registration mechanism.
- Preserve revision provenance, integrity checks, licenses, atomic updates and
  verified offline fallback. Do not execute downloaded installer code.
- Do not modify running workspaces when upstream versions change. Distinguish an
  installed skill from a recommendation or an unavailable first installation.
- Keep research skills independent of visual-authoring selection. Respect stage
  permissions and explicit renderer/user requirements.
- Inference introduced by a skill or host tool follows [Governance](governance.md).
  Follow [tool boundaries](tools.md) for every exposed operation.
- Keep downloaded runtime files out of version control. `.agents/skills/` is runtime
  staging; `.agents/backend/` and `.agents/frontend/` are development guidance.

Test registration, both-provider staging, archives, updates, fallback and unavailable
cases with local fixtures. Never call a real inference provider in tests.

For upgrade lifecycle changes, read [upgrade guidance](upgrades.md) and its existing
shared policy rather than creating a second upgrade procedure here.
