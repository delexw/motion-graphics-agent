# SDK security guidance

Read the existing [SDK tool security and stage selection](../../src/server/agents/capabilities/README.md#sdk-tool-security-and-stage-selection)
before adding a model turn or changing native/custom tool exposure. It owns the
mode-selection table, current provider differences and enforcement requirements.
Keep that policy there rather than copying it into agent instructions.

Read the matching existing source before changing these boundaries:

- [Environment and sandbox boundaries](../../docs/project-file-isolation.md#environment-and-sandbox-boundaries):
  which environment/config access is blocked, why, and limits of each SDK sandbox.
- [SDK and command behavior](../../docs/project-file-isolation.md#sdk-and-command-behavior):
  provider homes, authentication, writable roots and command execution.
- [Research and command execution](../../src/server/agents/capabilities/README.md#research-and-command-execution):
  native web restrictions, networking and host MCP credential access.
- [Dependency lifecycle](../../src/server/agents/capabilities/README.md#dependency-lifecycle):
  cancellation and process cleanup.
- [Tool boundaries](tools.md) and [Governance](governance.md): handler enforcement
  and accounting for every model call, including calls inside tools.

Document the chosen mode at its owning turn/capability. Test both providers without
live inference. Keep intended restrictions distinct from what SDK controls enforce.
Follow the root documentation reuse rule for all new guidance.
