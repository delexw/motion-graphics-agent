# DeepSeek Harness provider

`../deepseek-agent.ts` implements the same `Agent` interface as Claude and Codex.
`../providers.ts` owns dispatch, prompts, invocation IDs and schema validation.
The UI and MCP use the shared provider contract and defaults in
`src/shared/agent-providers.ts`; existing jobs keep their recorded provider/model.

## Setup and authentication

Install through the normal npm/installer path. The official
`@deepseek-ai/dsh-sdk-client` and its matching `@deepseek-ai/dsh` runtime are
release candidates. The lockfile records the reviewed pair; npm's `latest` SDK tag
currently points at an older incompatible API, so do not substitute it blindly.
Set `DEEPSEEK_API_KEY` on the host, then restart Kiteva when no jobs are running.
`VIDEO_DEEPSEEK_MODEL` overrides the default main model. Main and text work default to
`deepseek-flash`, which supports image inspection. `deepseek-v4-pro` is text-only
and must not be selected for image-dependent authoring or review.

This adapter currently uses API-key authentication, not Harness account OAuth.
It does not copy a user's Harness home, plugins, settings, sessions or account grant.
An unset/rejected key produces an explicit runtime failure; there is no provider fallback.
Only the DeepSeek and AnySearch keys are forwarded alongside system and project-local
runtime variables. MCP servers retain their own scoped environment contracts.

## Execution and lifecycle

- `configuration.ts` writes private, invocation-specific overlays and bundles the
  application-owned policy plugin. Related jobs share project-local persisted
  sessions; concurrent turns do not overwrite one another's overlay.
- The SDK starts its matching runtime with an isolated home. Existing sessions use
  `resumeSession`; a failed resume never silently starts a replacement conversation.
  A resumed session retains its immutable origin directory, so the adapter explicitly
  sets its effective working directory to the current revision. Authoring overlays
  grant that exact workspace in addition to the project runtime root; read-only and
  text-only stages do not receive the additional authoring grant. The immutable
  origin remains a native sandbox boundary; changing directory does not revoke it.
- `runtime-plugin.ts` restricts the tool registry before the first model request and
  installs a monotonic dispatch guard. Text-only turns expose no tools. Read-only
  turns expose native inspection and the shared read-only MCP selection. Authoring
  adds native editing and shell tools. Every required MCP name must actually register.
- Native web, plugin management, scheduling and delegation tools are unavailable.
  The shared Blender command policy also runs before shell dispatch. The native
  sandbox is read-only or workspace-write; reads are not a filesystem secrecy
  boundary, as documented in [project isolation](../../../../docs/project-file-isolation.md).
- The shared system prompt replaces the Harness persona without interpolating task
  text. Images are encoded as real SDK image blocks. JSON is requested with the
  output schema and validated by the shared caller; this is not native constrained decoding.
- Common reasoning efforts map low → low, medium/high → high, xhigh → max. Native
  plan mode and Caveman compression are unsupported; Kiteva's read-only planning
  stage remains available. Native questions are cancelled rather than auto-approved.
- Cancellation closes and awaits the SDK-owned subprocess. Failures never cause an
  adapter-owned automatic retry. Telemetry/session-upload contributors are disabled.

## Governance and verification

`events.ts` reports observable assistant text, tool identities and per-step token
usage. Reasoning blocks and raw tool arguments/results are not copied into activity.
Each settlement has a stable session/sequence usage ID: replayed notifications count
once, while multiple steps and retry attempts within one invocation remain distinct.
The final top-level usage takes precedence over embedded stream samples; failed
attempts use the official last-stream-usage helper. Compaction usage is recorded
separately. Reasoning tokens are an output subset, never an extra billed bucket.
Cache and uncached input are disjoint in the SDK and normalized for existing reporting.
The SDK loads the MIT-licensed [dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter)
host plugin through the private profile. `cost-meter.ts` uses its public `getTurnCost`
service and saves per-call results, rate rows and source sequence IDs, then waits for
that work before process shutdown. After shutdown the adapter attaches each matching
estimate to its buffered usage event exactly once. It never adds the plugin's session
or parent totals to those per-call records. Unknown usage, unpriced models and failed
plugin accounting remain unknown, never zero. Charges are labelled plugin API estimates,
not provider invoices or subscription spend. The reported response model is retained.

The plugin's Web UI is not mounted. Its diagnostics go to stderr to keep SDK stdout
valid JSON-RPC. Balance, quota and automatic exchange-rate queries are disabled; the
upstream plugin still performs public pricing-catalog maintenance. Each project has
its own plugin ledger and settings. Do not import another user's ledger or enable
credential/balance discovery. Tests mock every external request, including public
pricing feeds. The plugin's own per-request de-duplication remains its responsibility;
Kiteva de-duplicates exported records by provider/session/sequence identity.

The official [DeepSeek Messages usage contract](https://api-docs.deepseek.com/guides/anthropic_api/)
uses final `message_delta.usage`, replacing initial usage. The installed SDK's
`updateUsage` implementation assigns those fields, then emits one final usage chunk.
The SDK's `inputTokens` is uncached input; cache reads/writes are separate buckets.
Kiteva records their sum as total input and never adds `reasoningTokens` or
`totalTokens` again. Failed-attempt settlements and compaction summaries are retained;
live token-meter projections and repeated return-value notifications are not summed.

Use mocked SDK responses and local fixtures for tests. The provider tests cover
registration, stage permissions, accounting, malformed results, resume, credentials,
cancellation and failure cleanup. Configuration tests inspect actual saved overlays.
A real-runtime smoke check can target a loopback fake Messages service without any
external inference. This verifies integration plumbing, not video generation quality.

For dependency updates, use the existing [upgrade lifecycle](../../../../docs/dependency-upgrades.md).
