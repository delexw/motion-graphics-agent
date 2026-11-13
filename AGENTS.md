# Agent development rules

Claude and Codex share this file and its linked guidance. Read every applicable guide
before editing. These links are required task routing; do not assume all Markdown
under `.agents/` loads automatically. Do not create a separate `CLAUDE.md` copy.

## Required guidance by scope

| Work                                | Read before editing                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| Backend                             | [Backend guidance](.agents/backend/README.md)                                 |
| Any model call or Governance        | [Model calls and Governance](.agents/backend/governance.md)                   |
| Strategies or capabilities          | [Strategies and capabilities](.agents/backend/strategies-and-capabilities.md) |
| Job lifecycle and scheduling        | [Jobs](.agents/backend/jobs.md)                                               |
| Subworkflow execution and handoffs  | [Subworkflows](.agents/backend/subworkflows.md)                               |
| Dependency installation or upgrades | [Upgrade lifecycle](.agents/backend/upgrades.md)                              |
| Bundled skills                      | [Bundled skills](.agents/backend/bundled-skills.md)                           |
| SDK permissions and tool exposure   | [SDK security](.agents/backend/sdk-security.md)                               |
| Agent tools                         | [Tool boundaries](.agents/backend/tools.md)                                   |
| Frontend                            | [Frontend guidance](.agents/frontend/README.md)                               |

For changes spanning scopes, read every matching guide. Keep detailed rules in these
topic files and this entry point short. Do not inject development instructions into
generated projects' production prompts.

## Modular implementation

Modularity is required for every change, including UI, MCP, verification and shared
settings. Follow the [module-boundary policy](.agents/backend/strategies-and-capabilities.md#module-boundaries-for-all-changes)
and reuse the owning implementation rather than duplicating behavior across entry points.

## Documentation ownership and reuse

Before adding or expanding any agent guidance, search existing repository docs and
implementation guides. Link to the owning file and section when a rule already
exists; do not copy it. Add only missing agent-specific routing or constraints.
Put missing shared policy in its owning document and reference it from guidance.
Keep one authoritative location per policy, verify links, and update that owner
when behavior changes. Apply this rule to every new root, backend, frontend and
topic-specific agent Markdown file.

## Deterministic settings and user instructions

Dedicated project settings are authoritative. Preserve the user's original brief
and selected Motion Graphics. Check explicit contradictory production requirements
before creating or starting a project; never silently rewrite the brief or change
settings to resolve them.

Report the conflicting setting, its effective value and the source input field.
Only show an exact quotation when it is grounded in the supplied text. Keep the
draft and attachments so the user can edit and recheck. An unavailable or invalid
compatibility check blocks startup rather than implying compatibility. Scoped
creative suggestions and additional motion references are not automatically conflicts.

## Verification and delivery

Add tests for every new strategy, capability, registration and accounting path.
All codebase tests must mock third-party boundaries: HTTP requests, SDK calls,
package/model downloads and account/service access. Never contact a real external
service or download models during a test, including inference and JEV. Use injected
responses, sanitized recordings, local fixtures and preinstalled dependencies.
Recordings must exclude credentials, authorization headers, cookies, login state
and personal/private data; use synthetic placeholders and review them before commit. Local application/browser
E2E may run against loopback fixture services, with every third-party request blocked
or mocked. Dependency provisioning is a separate explicit setup step, not test logic.

Verify both successful and blocked/failed outcomes. Cover usage attribution,
missing usage, secret redaction, cancellation, malformed responses and persistence
without a project. Test the registration/caller path, not only isolated helpers.
For Governance UI changes, check the rendered interface in a local browser with
fixture data, including empty and failure states.

Run `npm run format:check`, `npm run lint`, relevant tests and `npm run build` after
changes. Read `.github/PULL_REQUEST_TEMPLATE.md` before preparing a pull request.
State which runtime paths were verified and whether the running service has loaded
the changes. Do not claim deployment from passing local tests.

Do not stage, commit, push or restart services without the user's authorization.
Keep unrelated files and generated test artifacts out of commits.
