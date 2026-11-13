# Separate strategies and capabilities

Each distinct decision strategy or agent capability must have its own implementation
owner in a separate class/module. Keep existing function-based strategies in their
own modules; do not wrap them in empty classes or mix unrelated decisions into one
handler. A strategy owns its context, criteria, output validation and failure policy.
A capability owns its tools, guidance, metadata and lifecycle.

Register each implementation at its composition point so the application can reach
it. Importing or documenting an unused implementation is insufficient.

- JEV strategies live in `src/server/jev/strategies/`. Connect them explicitly from
  the owning workflow and document their decision/API in `src/server/jev/README.md`.
  JEV currently has explicit workflow call sites, not a universal strategy registry.
- Agent MCP capabilities register through
  `src/server/agents/capabilities/registry.ts`, with stage permissions and shared
  contracts for Claude and Codex. Read-only and text-only turns retain their limits.
- Bundled skills register through `src/server/agents/bundled-skills/registry.ts`.
- New model purposes also register in Governance as described above.

If a new family needs a registry, give it a typed shared contract and explicit
registration at its owner. Keep registration separate from execution and provider
transport. Reuse shared helpers at their lowest common owner; do not duplicate
provider setup, usage accounting or event parsing in each strategy.

## Module boundaries for all changes

- Before implementation, identify the owner of domain rules, UI presentation, transport,
  execution and verification. Keep these responsibilities separate; do not grow a page,
  route or coordinator into the implementation of unrelated behaviors.
- Shared settings, defaults and validation have one authoritative module consumed by UI,
  MCP and backend callers. A transport must not reimplement domain decisions.
- Independent strategies and evidence sources have dedicated implementations and register
  through a typed composition point. Adding a new source must not require embedding its
  logic into the reporting page or aggregation loop.
- Keep reusable UI units separate from fetch/orchestration state; use them consistently
  in all entry points. Extract when there is a real ownership boundary, not merely to
  create wrappers or classes without behavior.
- Test modules and their actual registrations, then verify the complete runtime route.
  References to existing owning documents take precedence over copying policy into new files.
