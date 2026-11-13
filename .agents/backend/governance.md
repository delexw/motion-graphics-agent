# Model calls and Governance

Every new model call must be visible in Governance. This includes JEV decisions,
planning, review, repair, generation and calls made by agent tools. Reuse the shared
provider client and event contracts; do not add an untracked direct SDK or HTTP call.

Before adding a call:

1. Give it a stable, descriptive purpose and invocation ID. Keep that ID across
   its start, response, usage and terminal outcome records.
2. Record the configured provider/model and the actual response model when supplied.
   Capture the submitted input and output contract through the existing prompt
   recording path. Record only observable data; never claim access to provider
   internal prompts or hidden reasoning.
3. Record provider-reported usage, cache usage and cost basis. Missing usage or
   unknown pricing must remain unknown, never zero. Preserve known usage when
   output validation fails, and distinguish logical invocations from SDK retries.
4. Persist success, rejection, failure and cancellation outcomes. Calls before
   project creation need their own durable records: a rejected start has no project
   timeline. Link these records to the draft and, if created, the project.
5. Register the purpose and model routing in Governance's responsibilities view and
   expose the actual call records, inputs, outcomes and usage in its reporting UI.
   Show per-call token usage, monetary cost and pricing basis directly in the UI,
   including pre-project checks. Raw usage JSON alone is insufficient. Include known
   costs in the appropriate subtotals and retain enough precision for sub-cent calls.
   Distinguish provider-reported cost, API estimates and unknown charges.
   Adding a label without recording calls does not complete this requirement.

Redact credentials and secrets before persistence or display. Governance must not
expose API keys, authorization headers or provider error bodies containing secrets.
Keep invocation attribution in the orchestrating caller or strategy; transport
clients dispatch requests and return responses without owning workflow side effects.

Relevant owners:

- Shared event contract: `src/server/agents/agent.ts`.
- JEV client and shared Choice execution: `src/server/jev/client.ts` and
  `src/server/jev/choice.ts`.
- Project reporting and recorded prompts: `src/server/governance/`.
- Pre-start check storage: `src/server/jobs/store.ts`.
- Shared Governance contracts: `src/shared/governance.ts` and
  `src/shared/request-settings-review.ts`.
- Governance routes and responsibilities: `src/server/app.ts`.
- Governance interface: `src/client/governance/`.

For verification, follow the root AGENTS.md third-party mock rule; never make live
provider calls or downloads to populate Governance test data.

## Query boundaries

- Governance project lists and settings checks use validated server-side pagination and search. Do not load all runs or every technology record to paginate in the browser.
- Project search uses the SQLite FTS index; timestamps and project-specific settings checks have query indexes. Keep search entries synchronized with insert/update/delete.
- Technology evidence is fetched only when its project panel is open, for one job and the requested page. Cache unchanged event aggregation and evidence digests; invalidate when project events/state or evidence file metadata changes.
- Totals built from a loaded page must be labelled as page subtotals, not global totals. Tests must prove request boundaries, search changes and cache invalidation using local fixtures.
