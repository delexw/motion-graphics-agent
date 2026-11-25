# Gemini Antigravity provider

`../gemini-agent.ts` implements the same `Agent` interface as Claude, Codex and DeepSeek.
`../providers.ts` owns dispatch, prompts, invocation IDs and schema validation. The UI
and external Kiteva MCP use the shared provider contract and model choices in
`src/shared/agent-providers.ts`.

## Supported models

- **Gemini 4 Neon** (`gemini-4-neon`): default Gemini main model (`low | medium | high | xhigh`).
- **Gemini 4 Carbon** (`gemini-4-carbon`): selectable as `mainModel: "gemini-4-carbon"` in
  the UI model selector and through Kiteva MCP (`create_idea`) (`low | medium | high`).
- **Gemini 4 Hydrogen** (`gemini-4-hydrogen`): lightweight text/review/repair model used for
  small tasks (analogous to Haiku for Claude and Luna for Codex) (`low | medium | high | xhigh`).

`VIDEO_GEMINI_MODEL` overrides the default Gemini main model when `mainModel` is not
explicitly set on a project. Model ownership is enforced without silent substitution.

## Transport selection and authentication

`resolveGeminiTransport()` selects between two local backends (`VIDEO_GEMINI_TRANSPORT`
accepts `auto` (default), `cli`, or `sdk`):

1. **`agy` CLI (`--output-format stream-json`) — default when no Gemini/Vertex API key is set**
   - Uses your existing Antigravity CLI login (`agy` installed on `PATH` or `~/.local/bin/agy`;
     override with `VIDEO_GEMINI_AGY_BIN`). No `GEMINI_API_KEY` is required.
   - Fails fast with an explicit error if `agy` is not installed or not executable.
   - Preserves `HOME` for Antigravity OAuth login while keeping caches/temp project-local
     and stripping all unrelated provider API keys and internal Kiteva tokens.

2. **Antigravity Python SDK bridge (`bridge.py` + `google-antigravity`) — default when API/Vertex credentials are set**
   - Selected automatically when `GEMINI_API_KEY`, `GOOGLE_API_KEY`,
     `GOOGLE_GENAI_USE_VERTEXAI=true`, or `GOOGLE_GENAI_USE_ENTERPRISE=true` is set on the host.
   - Provision explicitly before running SDK jobs (backend startup, generation and tests
     never download or install Python packages):
     ```bash
     npm run gemini:setup
     ```
   - Uses `.data/gemini-sdk-venv` by default (override with `VIDEO_GEMINI_PYTHON`).
   - Credentials are passed only through the bridge subprocess's scoped environment — never
     serialized into stdin JSON payloads, project attachments or MCP tool arguments.

## Execution, security and MCP

- **Python SDK bridge (`bridge.py`)**:
  - Creates private, project-local directories (`home`, `app-data`, `sessions`, `cache`)
    under `prepareProjectRuntime(workspace, "agent").root + "/gemini"` and binds
    `app_data_dir` and `save_dir` there. Host `~/.gemini` state is not imported.
  - Resumes saved sessions with `SessionContinuationMode.RESUME` (no silent replacement).
  - Enforces stage boundaries monotonically via `CapabilitiesConfig.enabled_tools`,
    `policy.workspace_only`, `RunCommandConfig(enable_sandbox=True, enable_daemons=False)`,
    `@hooks.pre_tool_call_decide`, and `@hooks.on_interaction` (`cancelled=True`).
  - Wires internal capability MCP servers (`options.capabilityServers`) into
    `LocalAgentConfig.mcp_servers` as `McpStdioServer` instances with each server's own
    scoped environment and explicit `enabled_tools` allowlist (omitted for `textOnly`).

- **`agy` CLI backend**:
  - Passes `--output-format stream-json`, `--model`, `--effort`, `--json-schema <file>`,
    `--settings <session-only-file>` (`allowNonWorkspaceAccess: false`,
    `enableTerminalSandbox: true`, `artifactReviewPolicy: "always-proceed"`,
    `permissions.allow` for the stage's configured MCP servers, and stage-scoped
    `permissions.deny` rules blocking `read_url(*)`, `execute_url(*)`, `command(blender)`,
    plus file/command/MCP denies for `textOnly`/`readOnly`), `--sandbox`, and
    `--conversation <sessionId>` when resuming.
  - Uses `--mode plan --sandbox --disable-slash-commands` for `textOnly`,
    `--mode plan --sandbox` for `readOnly`, and `--dangerously-skip-permissions --sandbox`
    for authoring.
  - Writes turn-scoped `.agents/hooks.json` (`PreToolUse` command hook enforcing stage
    allowlists, workspace containment, allowed MCP tools, and Blender command denial) and
    `.agents/mcp_config.json` (Kiteva capability MCP servers, or `{}` in `textOnly`),
    restoring/removing them in `finally`.
  - Stages attached images inside the workspace `.kiteva-inputs/gemini-cli/` directory for
    the turn and deletes them in `finally`.

Both transports disable native plan mode (Kiteva uses its own read-only planning stage)
and run inside `withProcessScope` so cancellation terminates the full process tree.

## Governance and verification

`events.ts` emits observable text, normalized tool identities and per-turn token usage for
both transports. Private reasoning/thought chunks and raw tool arguments/outputs are
excluded from activity. In Gemini `UsageMetadata`, `cached_content_token_count` is a
subset of `prompt_token_count`, and `thoughts_token_count` is separate from
`candidates_token_count`; Kiteva records `input_tokens = prompt_token_count`,
`cached_input_tokens = cached_content_token_count`, and
`output_tokens = candidates_token_count + thoughts_token_count` (preserving
`reasoning_output_tokens`). Missing or malformed fields stay `null`, never `0`. When no
explicit SDK cost is reported, Governance estimates API-equivalent spend in
`src/server/governance/gemini-pricing.ts` using standard paid-tier Gemini API rates
(labelled `Standard API estimate · Gemini API rates`, not a provider invoice or
subscription meter); unknown Gemini model IDs or missing token counts remain `null`
(`"Not reported"`).

All automated tests mock both the Python bridge and `agy` CLI boundaries using local
fixture scripts and never invoke live APIs, external logins or package downloads. For
dependency updates, use the existing [upgrade lifecycle](../../../../docs/dependency-upgrades.md).
