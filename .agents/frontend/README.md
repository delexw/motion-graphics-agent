# Frontend agent guidance

Read before changing `src/client/`. Follow the shared [module-boundary policy](../backend/strategies-and-capabilities.md#module-boundaries-for-all-changes). For API changes, also read
[backend guidance](../backend/README.md). Source paths are relative to the repository root.

- Use existing React/Ant Design components and shared contracts. Browser-only code
  must not import Node APIs or server modules. Initialize browser state safely.
- Dedicated settings remain authoritative. Preserve the brief, attachments and
  choices on validation, conflict or network failure. Never silently change them.
- Render typed server errors with their details. Setting conflicts show the setting,
  effective value, source field and working edit actions. Do not invent quotations
  or offer a bypass for a mandatory startup check.
- Make checking, stale results, blocked starts, empty history and failures explicit.
  Prevent duplicate starts; do not present an old check as current.
- Use `src/client/i18n/` for copy and maintain English/Chinese coverage. Preserve
  keyboard access, focus, accessible labels and status announcements.
- Governance exposes real persisted records, including checks without projects.
  Missing usage is unknown, not zero; configured routing is not an observed call.
  Read [Governance](../backend/governance.md) before changing reporting.
- Put reusable UI logic in its shared owner. Do not duplicate error interpretation
  between the legacy composer and room onboarding. UI affordances must reflect
  [tool boundaries](../backend/tools.md); the server still enforces permissions.

Verify rendered behavior in a local browser with fixtures: edit navigation, preserved
drafts, loading, stale results, empty history and error recovery. Build success alone
is not runtime proof. Never use live inference in verification.
