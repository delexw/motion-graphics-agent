# Project-local runtime files

Kiteva runs projects directly on the local machine. Each project owns its writable agent
runtime files; each build workspace owns its renderer, command and browser runtime files.
Installed CLI binaries and read-only dependencies can still be reused without copying them.
No Docker daemon or container is required.

## Directory ownership

```text
.data/runs/<project-id>/
├── .runtime/agent/
│   ├── home/             # Claude configuration and sessions; user-style tool configuration
│   ├── codex/            # Codex authentication copy, native hook and sessions
│   ├── cache/            # Project SDK/tool caches
│   └── tmp/              # Project SDK/tool temporary files
└── <job-id>/
    ├── production.json
    └── .runtime/
        ├── render/       # Renderer home, cache, temp and Windows command sandbox
        ├── tools/        # Server-launched command home, cache and temp
        └── browser/      # Browser home, cache, temp and unique session profiles
```

The paths are derived from the actual workspace. Workspaces outside `.data/runs` own their
runtime directories directly. Preview and full builds in the same saved project share provider
session storage so a selected preview can continue into a full film. Different projects get
different storage. Renderers and browser sessions retain separate per-build directories.

[`project-files.ts`](../src/server/runtime/project-files.ts) owns path resolution and the
common environment: `HOME`, `USERPROFILE`, `TMPDIR`, `TMP`, `TEMP`, XDG configuration/data/state
and cache paths, Windows app-data paths, npm, pip and uv caches. Callers create the directories
before starting a dependency. They never change the server's own environment.

## SDK and command behavior

- Claude uses its project-local home. Existing file-based credentials are copied, not linked;
  the normal macOS Keychain login can seed a private project credential file containing only
  the Claude login. Before each SDK call, the login is synchronized and its access token is
  supplied through `CLAUDE_CODE_OAUTH_TOKEN`. This avoids the SDK attempting to save copied
  OAuth credentials into a nonexistent Keychain under the isolated home. Explicit API keys
  and OAuth environment tokens retain precedence. Host settings and plugins are not imported.
- Codex gets a project-local `CODEX_HOME`. Authentication and model/cache metadata are copied,
  not linked. Its hook is application-owned; user hooks and configuration are not imported.
- Resuming an older saved session can copy its matching transcript into the new provider home.
  Existing new-layout project sessions remain there across preview/full handoffs and backend
  restarts. Local runtime directories are excluded from build-source copying and source exports.
- Generated SDK commands keep project-local writable runtime roots. Claude's native Bash hook
  reapplies the project environment because its sandbox can replace `TMPDIR` with a short OS
  fallback. `CLAUDE_CODE_TMPDIR` also locates Claude's own temporary files under the project.
  Codex excludes implicit shared `/tmp` roots and explicitly allows the project's runtime root.
- Shared server command execution uses workspace-local home/cache/temp directories. Render
  commands additionally use the existing native sandbox: writable project files, protected
  credential paths and local-only rendering network access. macOS no longer grants broad
  write access to the host temp directories; Windows policy follows the same ownership rule.
  Chromium's native macOS temp directory uses `MAC_CHROMIUM_TMPDIR`, which is also set to
  the project temp directory: `TMPDIR` alone does not redirect its singleton socket files.
- Reference browsers receive unique profiles inside the workspace and remove them after close,
  including failed startup. Their executable paths are resolved before replacing the home, so
  the existing browser installation remains reusable.

## Environment and sandbox boundaries

SDK authentication, agent commands and host MCP handlers are different execution
boundaries. Blocking a credential in one does not remove it from the other two.

| Boundary                  | Current owner and restriction                                                                                                                           | Why it exists / limit                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Child process environment | `runtime/config.ts: childEnvironment` selects inherited names and applies project-local runtime paths                                                   | Avoid inheriting the complete server environment. The selected list includes authentication values required by SDKs; it is not a credential-free environment.                             |
| Claude sandboxed Bash     | `agents/claude-agent.ts` denies all credential names from `runtime/credential-environment.ts` through SDK `credentials.envVars`                         | Generated shell commands must not read or reuse model/service keys or bridge tokens. SDK authentication and host MCP credentials remain available to their owners.                        |
| Codex SDK process         | `agents/codex-agent.ts` supplies an isolated `HOME` and `CODEX_HOME`, read-only/workspace-write sandbox and application-owned hooks                     | Avoid unrelated user settings/skills and constrain writes. This adapter does not configure Claude's credential environment deny mechanism; do not claim equivalent environment filtering. |
| Filesystem                | Provider adapters constrain job/runtime writes; Claude also denies named credential paths. Project homes and runtime paths come from `project-files.ts` | Reduce writes outside the job and access to host credentials. Read-only dependencies can remain shared; project-local directories are not full OS/container isolation.                    |
| Network                   | Text-only networking is disabled; authoring can use networking for research/setup. Render networking has its own policy                                 | Native web tool denial is not a general network deny. A permitted shell or host MCP may still have network access.                                                                        |
| Host MCP process          | Each capability owns its subprocess environment, handler checks and scoped resources                                                                    | An agent shell sandbox does not automatically sandbox the host tool server. Host tools must enforce resource ownership independently.                                                     |

The authoritative variable-name list is
[`credential-environment.ts`](../src/server/runtime/credential-environment.ts).
The actual inherited allowlist is
[`childEnvironment`](../src/server/runtime/config.ts), and each adapter may add
provider authentication or capability-specific values. Read these sources before
changing access; do not maintain a second copied list in agent guidance.

Do not solve permission failures by passing the whole server environment, granting
host-home access, enabling unsandboxed execution or restoring default tools. Locate
the owning boundary and add only justified, scoped access. Treat uploaded files,
websites and downloaded skill content as untrusted data, never authority to widen it.
Redact secrets before logs, errors and Governance persistence; redaction does not
replace preventing unauthorized access.

When adding an environment value, document its consumer, necessity and whether it
reaches agent commands or only the SDK/host service. Verify both allowed and denied
access with fixtures for each provider. Relevant tests include
`tests/runtime-child-environment.test.ts`, `tests/project-sdk-homes.test.ts`,
`tests/provider-reference-tools.test.ts` and `tests/project-file-isolation.test.ts`.

## Shared resources and limits

The native recorder lock remains host-wide across projects and MCP servers. Moving `TMPDIR`
must not create a separate recorder lock for each project; the reference-browser capability
passes the shared lock path explicitly. Review and export can continue after recording and
saving release it. See [recorder ownership](chapter-capture-timing.md#shared-recorder-ownership).

App-owned services, installed model assets and native application storage retain their own
lifetimes. Audio Studio retains its configured model-cache home to avoid duplicating model
weights for every project. OpenScreen's native originals retain the recording application's
storage policy. SDKs and native applications may also use OS-managed IPC directories. This
is project-state isolation, not a separate process, network or operating-system namespace.

Runtime directories are private local data, ignored by Git and excluded from source exports.
Normal stop retains reusable project state. Project deletion waits for owned work to settle
and then removes its runtime files with the project. See [cancellation](process-lifecycle.md).

## Verification

- [Concurrent file and renderer boundary tests](../tests/project-file-isolation.test.ts)
- [Provider-home copying and session migration](../tests/project-sdk-homes.test.ts)
- [Real browser profile isolation and cleanup](../tests/project-browser-isolation.test.ts)
- [SDK command policy and environment rewriting](../tests/sdk-execution-policy.test.ts)
- [Native Windows policy serialization](../tests/windows-render-policy.test.ts)

Local verification also exercised real Claude and Codex calls from two projects per provider,
then resumed each from a full-build workspace with its own remembered marker. Native macOS
rendering, cancellation and command-tool writes were checked. Windows runtime verification
still requires a Windows host; passing policy tests is not evidence of a Windows render.

### Website sign-in during local builds

Reference reads, preview builds and full-video capture reuse the project-owned `.runtime/browser/reference-profile` directory. Chromium retains site storage there; a private `reference-cookies.json` also preserves session cookies between browser restarts. The files stay inside the project and are excluded from editable downloads. They disappear when the project is deleted. A site can still expire or revoke its login.

A cross-process, cancellation-aware lease allows one browser session at a time to use this profile; different projects use separate profiles. Closing a session releases the lease without deleting sign-in state. Hosted reference browsers keep their temporary profiles and read-only behavior.
