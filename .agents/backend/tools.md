# Tool boundaries

Every agent tool must have a clear, enforced contract. Read
`src/server/agents/capabilities/README.md`, the capability's registration and its
shared types before adding or changing a tool.

Read [SDK security guidance](sdk-security.md) before choosing native versus custom
tools. Reference its existing policy instead of duplicating its mode-selection table.

## Tool contract

Document these fields in the tool's description, schema and owning capability guide:

| Field             | Required boundary                                                        |
| ----------------- | ------------------------------------------------------------------------ |
| Purpose           | The single operation this tool performs and when an agent should use it  |
| Inputs            | Validated types, required fields, supported formats and size limits      |
| Outputs           | Typed success/failure data and what counts as completion evidence        |
| Scope             | Allowed project/workspace, files, URLs, asset ownership and resources    |
| Side effects      | Reads, writes, processes, network access, inference and cost             |
| Stage permissions | Whether planning, read-only, text-only and generation stages may call it |
| Exclusions        | Actions this tool cannot perform and the owner of those actions          |
| Recovery          | Cancellation, timeout, retry/idempotency behavior and retained artifacts |

## Enforcement

- Give each tool a dedicated handler owned by its capability. Register it through
  that capability's tool server and the shared capability registry. Do not add a
  generic escape tool that bypasses stage or workspace restrictions.
- Enforce permission and ownership in code before any side effect. Prompt text,
  tool descriptions and model-selected arguments are not access control.
- Expose only allowed tools at each stage; enforce the same limits inside handlers
  and across Claude/Codex adapters. Read-only tools must not install, write or launch
  generation. A research tool must not silently become an execution tool.
- Keep orchestration in the caller. Search returns evidence; selection returns a
  decision; generation creates its named artifact; validation checks it. None may
  silently change project settings or start another workflow outside its contract.
- Validate paths, URLs and external responses with existing shared helpers. Preserve
  project isolation and treat retrieved content as data, not tool instructions.
- Return human-readable `content` and typed `structuredContent` for MCP results.
  Share discriminated result types across consumers. Report unsupported input,
  partial results and failures explicitly; never fabricate success or evidence.
- Attribute tool activity to its project/job/invocation. Any nested model call must
  also follow [Governance](governance.md); a tool event alone does not account for it.

Test registration and real handlers with fixtures, including forbidden stages,
out-of-scope resources, malformed input/output, cancellation, duplicate side effects
and accurate failure results. Never use live inference for verification.

For technology selection, dependency files and runtime-use evidence, read the
[existing technology lifecycle](../../docs/technology-pool.md#final-project-dependencies-and-usage-monitoring);
keep that policy in its owning document.
