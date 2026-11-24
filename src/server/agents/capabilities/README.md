# Built-in agent capabilities

These are MCP tools registered with the Claude, Codex and DeepSeek SDK adapters on each turn.
They are separate from authoring skills (`../bundled-skills/`), Motion Graphics and rendering engines.

| Capability                                                              | Registration                                     | Guidance                                 | Implementation                                                                                                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Reference browser](reference-browser/)                                 | [capability.ts](reference-browser/capability.ts) | [prompt.ts](reference-browser/prompt.ts) | [tools.ts](reference-browser/tools.ts), [server.ts](reference-browser/server.ts), [tool-registry.ts](reference-browser/tool-registry.ts), [types.ts](reference-browser/types.ts) |
| React Bits                                                              | [capability.ts](react-bits/capability.ts)        | [prompt.ts](react-bits/prompt.ts)        | [tools.ts](react-bits/tools.ts), [server.ts](react-bits/server.ts)                                                                                                               |
| Animate UI                                                              | [capability.ts](animate-ui/capability.ts)        | [prompt.ts](animate-ui/prompt.ts)        | [tools.ts](animate-ui/tools.ts), [server.ts](animate-ui/server.ts)                                                                                                               |
| Creative Pool                                                           | [capability.ts](creative-pool/capability.ts)     | [prompt.ts](creative-pool/prompt.ts)     | [tools.ts](creative-pool/tools.ts), [server.ts](creative-pool/server.ts)                                                                                                         |
| Narration                                                               | [capability.ts](narration/capability.ts)         | [prompt.ts](narration/prompt.ts)         | [tools.ts](narration/tools.ts), [server.ts](narration/server.ts)                                                                                                                 |
| [Audio Studio MCP](https://github.com/kanaworksai-hue/audio-studio-mcp) | [capability.ts](audio-studio/capability.ts)      | [prompt.ts](audio-studio/prompt.ts)      | [tools.ts](audio-studio/tools.ts), [server.ts](audio-studio/server.ts), [client.ts](audio-studio/client.ts)                                                                      |
| Music analysis                                                          | [capability.ts](music-analysis/capability.ts)    | [prompt.ts](music-analysis/prompt.ts)    | [tools.ts](music-analysis/tools.ts), [server.ts](music-analysis/server.ts), [audio service](../../audio/music-analysis.ts)                                                       |

`registry.ts` collects registrations and guidance. Text-only calls receive neither. Planning/review
calls (`readOnly: true`) get `search_components` and `read_component`; build/correction calls also get
`install_component`. The planning server does not register the installation tool, independent of
provider permissions or prompt compliance. No user/global MCP configuration is modified.

## SDK tool security and stage selection

Choose the smallest tool surface before dispatch. This table is the policy for new
turns; the next table records current adapter behavior. Adding custom MCP servers
does not disable SDK built-in tools.

| Task needs                                                                             | Tool policy                                                                                                                                |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| All evidence is supplied; only classification, extraction or structured text is needed | No task tools. Use a text-only turn or a direct structured API such as JEV.                                                                |
| The complete task is covered by bounded custom handlers                                | Custom tools only. Explicitly disable default shell, file mutation, native web and other unnecessary built-ins. No generic shell fallback. |
| Local evidence inspection and scoped external inspection                               | Necessary native read tools plus read-only custom tools; no installation, mutation or generation.                                          |
| Project implementation, local checks and capability-owned operations                   | Necessary native authoring tools plus stage-scoped custom tools within the job/runtime boundary.                                           |

A new custom-tools-only mode requires explicit enforcement in every provider
adapter. There is currently no shared `customToolsOnly` option. `textOnly` is not
that mode: it removes task MCP tools too. If the SDK cannot enforce a requested
restriction, block the turn or choose a supported narrower route. Never describe
an enabled default tool as disabled because the prompt says not to use it.

### Current adapter behavior

| Mode                                          | Claude                                                                                                                                      | Codex                                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `textOnly`                                    | Native `tools: []`; no task MCP servers or staged skills                                                                                    | No task MCP servers or staged skills; network off; forbidden tool activity is rejected from the event stream. This is not pre-dispatch removal of native tools. |
| Ordinary `readOnly`, without native plan mode | Read/Glob/Grep/Skill, plus Agent only for enabled brief exploration; read-only task MCP tools                                               | Native read-only sandbox plus stage-scoped task MCP tools; not the same native allowlist as Claude                                                              |
| Native `planMode`                             | Requires `readOnly`; SDK plan permissions and explicit planning handoff govern a broader native list, alongside stage-scoped task MCP tools | No separate native plan-mode mapping; read-only sandbox remains the boundary                                                                                    |
| Authoring/build                               | Explicit native read/write/edit/shell/Skill list plus task MCP tools                                                                        | Workspace-write sandbox and native SDK tools plus task MCP tools                                                                                                |

Narration, Audio Studio, Music analysis, Bevy and pixel asset tools are unavailable
in read-only/text-only turns. Native web tools remain disabled; research uses the
verified AnySearch skill when file/command tools are permitted.

DeepSeek uses the same capability registry through a separate [Harness SDK adapter](../deepseek/README.md). It restricts native and MCP tool names before request assembly and checks them again at dispatch; unsupported MCP registration blocks the turn.

Enforcement belongs to [Claude](../claude-agent.ts), [Codex](../codex-agent.ts),
[DeepSeek](../deepseek/README.md), the
[provider entry](../providers.ts) and [capability registration](registry.ts).
Verify dispatch configuration and forbidden-tool behavior for every supported provider.
Native plan mode is not equivalent to the ordinary read-only allowlist. Prompt
instructions are not SDK permissions or handler access checks.

For environment variables, credentials, filesystem/network isolation and their
limits, read [environment and sandbox boundaries](../../../../docs/project-file-isolation.md#environment-and-sandbox-boundaries).
For command networking and host MCP credentials, read
[research and command execution](#research-and-command-execution).
Tests use `tests/integration/provider-reference-tools.test.ts`, `tests/integration/react-bits-tools.test.ts`
and `tests/integration/sdk-execution-policy.test.ts`; never invoke real inference to verify policy.

## Capability architecture

```mermaid
flowchart TB
  Turn["Shared agent turn"] --> Registry["Capability registry + stage permissions"]
  Registry --> Claude["Claude SDK adapter"]
  Registry --> Codex["Codex SDK adapter"]
  Claude --> MCP["Same job-scoped MCP contracts"]
  Codex --> MCP
  MCP --> Browser["Reference browser: inspect / browser controls / capture_video"]
  Browser --> Capture["Shared capture implementation: local or desktop worker"]
  MCP --> Pool["Creative Pool: catalog + inspect"]
  MCP --> Components["React Bits / Animate UI"]
  MCP --> Narration["Narration create/edit + Audio Studio"]
  Pool --> Services["server/technology<br/>availability / runtime paths / bundling"]
  Services --> Runtime["Project-local environments"]
  Model["Model chooses tools"] --> Setup["Model runs documented setup<br/>npm, Python or other ecosystem"]
  Setup --> Runtime
  Pool -- "authoring only" --> Prepare["prepare_technology / stylesheet<br/>bundle only; never install"]
  Prepare --> Services
  Research["Bundled Skill(anysearch)<br/>docs / CLI / examples / source"] --> Model
```

All Kiteva-owned tool servers register tools with `McpServer.registerTool()`. Narration and the
Audio Studio adapter use `shared/service-tool-input.ts` to publish their existing service-owned
JSON schemas through Zod metadata while forwarding object arguments unchanged. Narration's
service and Audio Studio's upstream server retain validation, defaults and structured errors;
the adapter must not strip extra properties or apply defaults before forwarding. Narration retains
its serial create/edit queue, cancellation and activity tracking. Audio Studio retains the upstream
allowlist, instructions, metadata, workspace path checks and request cancellation.

Tool contracts and responses are shared across providers; SDK permissions and events are adapted
at the boundary. Installation belongs to model execution, not to an MCP dependency manager.
[Architecture and research boundaries](../../../../docs/architecture.md#technology-capabilities-and-project-setup)
cover the complete flow. Provider events use shared activity categories; UI groups do not follow
execution-scope nesting.

## Folder layout

```text
capabilities/
├── registry.ts
├── reference-browser/      # Registration/prompt/server/tools/types, tool registry and browser support
├── animate-ui/
│   ├── capability.ts
│   ├── prompt.ts
│   ├── server.ts
│   └── tools.ts
├── react-bits/             # Same registration/prompt/server/tools layout
├── creative-pool/          # Same layout, plus capability-specific types.ts
├── audio-studio/           # Same layout, plus client.ts and types.ts
├── narration/              # Registration/prompt/server/tools; shared audio types live in audio/
└── shared/
    ├── types.ts
    └── component-registry-tools.ts
```

Browser tools retain the `reference_browser` MCP name and all existing tool names. The shared registry owns stage availability for both providers; adapters no longer register browser tools separately. The browser capability owns tool contracts, guidance and browser support; `server/capture/` and the website capture workflow retain recording/worker orchestration. Context recovery keeps its existing text-only exception and provider proxy configuration.

Each capability owns its registration, system guidance, server entry point, tools and specific types.
The root registry only collects capabilities. Shared types and the component-registry adapter stay in
`shared/` because multiple capabilities consume them.

## Animate UI and authoring resource selection

`animate_ui` exposes the official [Animate UI registry](https://animate-ui.com/docs/mcp) through the
same controlled registry adapter as React Bits. Planning exposes `search_components` and
`read_component`; building also exposes `install_component`. The tool saves source, declared
dependencies, provenance and the upstream license under `components/animate-ui/` without running
scripts, installing packages or trusting upstream target paths. The official `@animate-ui/react`
package is available locally. Source with other missing dependencies must be adapted or reported;
it must not silently change the renderer or claim installation makes every dependency available.
The upstream MIT + Commons Clause terms apply to imported component source.

Before a new job's model turn, JEV evaluates Animate UI, React Bits, installed bundled skills and
existing local code against the actual brief, chosen Motion Graphics, renderer and available
packages. One native Choice API question selects exactly one primary resource from all alternatives,
without per-resource yes/no thresholds or a fixed weighting scheme. Ordinary local code remains
available to implement the chosen approach. The selected IDs and decisions are saved on the job and supplied as
`authoringResources` in `style-context.json`. This selects authoring resources, not Motion Graphics,
and does not replace the main model's production plan or disable tools. Existing completed renders
resume without a new selection call. JEV failure is recorded as a warning with a limitation; it does
not block generation. Invocation and usage use the same Workflow/Governance event path as other
JEV calls. Both providers receive the decision and renderer-specific usage guidance. Video effects
must be adapted to deterministic composition time; interactive pages retain accessibility and
reduced-motion behavior.

## Creative pool lookup

The internal `creative_pool` server provides `search_pool` and `read_pool_entry` to both SDKs during
planning, building and repairs. It reads the application's current Motion Graphic, motion and
technology catalogs locally. Search returns matching IDs and names; reading returns authoring definitions, including sequences,
constraints and implementation guidance, in both text and typed structured content. Source-review
and provenance fields are omitted without changing the catalogs. `includeCreativeAlternatives`
on the agent turn is passed through the shared capability registration to the MCP server as
`KITEVA_POOL_INCLUDE_ALTERNATIVES`. Automatic exploration defaults to true. Fixed-style preview
direction planning, selected-direction video planning, builds, repairs and result reviews pass false
to omit `motion_graphic_variants` and `suggested_combinations`. The model cannot override this
workflow-controlled filter with a tool argument. It writes no files and makes no network requests. Guidance requires reading named
definitions before implementation while preserving explicit user refinements and supplied assets.
Tool availability and instructions do not by themselves prove that the rendered motion is faithful;
the finished composition still needs visual verification.

Authoring handoffs carry selected IDs and primary/supporting roles, without embedded style definitions
or resolved catalog executable templates. Both providers receive shared system guidance to call
`read_pool_entry({ kind: "motion_graphic", idOrName: selectedId })` for every selected ID before
planning or implementation. Known IDs need no search; names in the original idea are resolved through
`search_pool`, then read in full. Production parameters and renderer contracts remain in the handoff;
catalog video examples do not override page interactions or the chosen renderer. The main model
interprets the full definitions, preserves draft roles and user act assignments, and records their
contributions in the storyboard. These are model instructions, not a host-enforced read gate. There
are no read receipts, style-scope contracts, quote-matching validators or forced style-planning turns.
The normal rendering and final-result review workflow remains responsible for delivered quality;
tool availability and guidance alone do not guarantee model compliance or visual fidelity.

React Bits publishes a [shadcn-compatible registry](https://reactbits.dev/get-started/mcp).
Kiteva's small MCP adapter reads that registry directly over HTTPS rather than launching the general
shadcn CLI. It fixes the upstream origins and rejects redirects, arbitrary URLs and unsafe file paths.
Search returns every matching variant; it has no hidden result cap. Source lookup is cached in memory
for the lifetime of that server. Network failures are tool errors; the model can continue with local
assets instead of treating React Bits as a prerequisite for generation.

Installation saves only the chosen component into a fresh
`components/react-bits/<variant>/<source-hash>-<unique-id>/` directory in the job workspace. It retains
source paths, complete registry JSON, declared npm dependencies, origin, SHA-256 and the upstream
license. Upstream `target` paths are ignored. Existing source is never overwritten, linked destination
directories are rejected, and downloaded scripts are never executed. This tool installs source files,
not npm packages: agents must reuse available dependencies or report missing ones. Additional registry
dependencies need explicit inspection rather than automatic recursive downloads.

The [React Bits license](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md) is MIT with a
Commons Clause restriction, not unrestricted MIT. Keep the downloaded notices with substantial copies;
do not redistribute the component collection. No upstream component code is bundled in Kiteva.

The provider adapters keep their existing event path. Tool events and usage carry the same invocation,
model, session and task attribution into Workflow/Governance. The adapter makes no AI calls and adds no
separate model billing path. Customer Activity shows only curated component-action labels.

## Narration MCP

Explicit refinement requests may amend the configured profile before this capability is
registered. Follow the [version settings lifecycle](../../../../docs/video-refinement.md#explicit-settings-changes); the narration tools retain their scoped cue-edit contract.

Configured narration jobs expose `create_narration` and `edit_narration` during build and correction
turns for both SDK providers. Planning, review and text-only turns receive no narration tools.
The orchestrator registers voice profiles without generating audio. The model creates initial speech
through `create_narration`, which saves `audio/narration.json`; subsequent edits read its cue IDs,
measured durations and revision before editing. Timing changes reuse the recorded audio. Text changes
use the existing speech provider to regenerate only the changed cue, retaining configured voices,
language, speed and volume. Creation replaces the narration with a new set of cues.

The audio service rejects stale revisions, overlapping measured cues, film overruns and paths outside
the job workspace. Tools return readable text and typed structured content. Shared schemas belong to
`audio/narration-types.ts`, alongside the service consumed by both MCP and orchestration. Before
rendering, the workflow reloads the accepted narration track; Kiteva still owns final speech/music
mixing and validation. The model must reconcile captions and visual timing with the returned cues.

## Music analysis MCP

`music-analysis/capability.ts` registers `analyze_music` for build/correction turns on all
providers, independently of Audio Studio and the selected renderer. Planning/review and
text-only turns do not receive it; read-only tool servers also omit the handler.
`music-analysis/tools.ts` exposes the shared contract from `src/shared/music-analysis.ts`;
`src/server/audio/music-analysis.ts` owns execution and persistence. The shared Activity
label in `src/shared/activity-model.ts` is “Analyzing music beats…”. Existing provider tool
events record its running/completed/failed outcome under the owning job and invocation.

The tool runs the already-installed `hyperframes beats <file> --json` in the existing
isolated process runner (180-second timeout and cancellation). It accepts a workspace-relative
WAV, MP3, FLAC, OGG, M4A, AAC, AIFF or Opus file up to 256 MiB inside render inputs;
traversal and symlink escapes are rejected. It neither installs dependencies nor uses inference
or network services. It preserves the audio and selected renderer. The validated response and
adjacent `<audio>.beats.json` contain source-relative beat timestamps, estimated BPM, count and
source SHA-256. Sidecars are replaced atomically only after successful analysis and a source
fingerprint recheck; failures/cancellation preserve the prior file. Repeated calls replace the
same sidecar, with no extra audio artifacts. Empty beat maps are valid, not invented timing.

Build guidance orders soundtrack preparation, analysis, then visual synchronization. Reanalyze
after audio edits and add the clip's film start to source-relative cue times. Beat estimates do
not establish downbeats, musical sections, listening quality or final sync. Review the delivered
sound and picture; preserve reading holds, natural narration and essential captured actions.

## Audio Studio MCP

Managed startup updates, version verification and fallback are documented in
[Dependency upgrade lifecycle](../../../../docs/dependency-upgrades.md#audio-studio-managed-updates).

[Audio Studio MCP](https://github.com/kanaworksai-hue/audio-studio-mcp) is a separate local audio
capability for both SDK providers. It does not replace the renderer or the visual-resource selection.
`audio-studio/capability.ts` registers the workspace adapter, `audio-studio/client.ts` probes upstream MCP
startup/tools, and `audio-studio/tools.ts` forwards the upstream tool schemas and server instructions.
Read-only planning/review and text-only turns receive no audio tools. Build turns expose
`generate_audio`, `edit_audio`, `process_audio` and `unload_models` when installed.

Run the root [install.sh](../../../../install.sh) for app and Audio Studio setup together. For a
standalone setup, use the upstream installer in `.data/audio-studio-mcp`, or set `AUDIO_STUDIO_MCP_COMMAND` to an
absolute executable path from an existing installation. Kiteva automatically detects
`.data/audio-studio-mcp/.venv/bin/audio-studio-mcp` (Windows: `.venv/Scripts/audio-studio-mcp.exe`).
Follow upstream hardware, runtime and model-license requirements. The Apple Silicon installer
supports `--skip-weights` for MCP/post-processing tests; the first generation then downloads model
weights. Installation/downloads are never started automatically by a video job. For Windows NVIDIA
setup use the upstream `install.ps1` instructions. Custom backend settings may use
`AUDIO_STUDIO_BACKEND`, `AUDIO_STUDIO_SA3_DIR`, `AUDIO_STUDIO_SA3_MODEL` and
`AUDIO_STUDIO_IDLE_UNLOAD_MIN`.

The adapter saves output under each job's `audio/audio-studio/`, rejects input files outside that
workspace (including symlink escapes), and retains upstream schemas, descriptions and argument
ranges. Outputs include readable text and discriminated structured content. Native MCP errors are
preserved. Generation/edit calls allow up to 30 minutes; no audio is generated during availability
probing. The agent integrates actual output through the chosen renderer, with narration mixed by
Kiteva's existing speech path. See `../../jev/README.md` for the independent audio Choice strategy.

Visual selection metadata belongs to each capability's `metadata.ts`; the shared registry client is
used by MCP component tools. JEV receives extracted prose about each option’s advantages and limits. React Bits names accept JS/TS-only entries as well
as JS/TS × CSS/Tailwind variants, matching the current official registry. Registry discovery remains
read-only; saving a component still does not install npm or recursively install registry dependencies.
See [JEV visual guidance](../../jev/README.md#visual-choice-guidance) for selection details.

The idea editor uses Ant Design X Sender tag slots and Suggestion for `@` style mentions. A mention
is saved inline as `<style id="style-140">Vintage Rubber Hose Animation</style>` in the original
idea string. Shared system guidance resolves its ID through `read_pool_entry` before authoring,
preserves adjacent act/scene scope and exclusions, and treats the label as reference data. Mentions
do not become Settings selections or enter host-side routing/count validation.

Motion clips use the same explicit mention path as Motion Graphics. The shared editor, picker preview and mention chip accept a `style` or `motion` variant; motion previews delegate to the existing MotionPreview player. The root loads the motion catalog once for editor consumers. Selecting a clip stores `<motion id="motion-036">Glitch Type Build</motion>`; the model reads that ID with `creative_pool.read_pool_entry` using `kind: "motion"`. Existing `<style>` references continue to use `kind: "motion_graphic"`. Neither variant extracts ordinary names from prose or adds Settings selections. Saved prompts across Assistant, project boards and governance use the same variant-aware PromptText renderer and hover preview.

## Technology availability and local preparation

Technology choice belongs to the main model. The shared Creative Pool MCP exposes
`inspect_technologies` in both planning and authoring calls. It reads current local availability
on demand for the requested IDs (or all entries), distinguishing installed browser packages,
host runtimes, built-in browser capabilities, authored techniques and required input assets.
No 92-entry availability report is attached to the model prompt or generated project context.
Catalog recommendations are not required installs or enforced stack choices.

Authoring exposes `prepare_technology` and `prepare_technology_stylesheet` to bundle browser
packages from a model-prepared `runtimeDirectory` inside the project. Neither tool installs
anything or resolves packages from Kiteva’s own dependency tree. The model reads the relevant
instructions and runs project-local npm, pip, CLI or other setup commands itself. Tool-only
packages are not application dependencies. Browser bundles return exact imports, CSS and assets;
Node, Python and other tools run directly in their model-prepared environments.

`inspect_technologies` accepts `runtimeDirectory`, `pythonExecutable` and a catalog-ID-to-project-
relative-path `executables` mapping. Project directories cannot escape through traversal or
symlinks. Missing packages remain unavailable until the model prepares them. Browser preparation
rejects dependencies resolving outside the selected runtime. Native capabilities, assets and
techniques retain their distinct requirements. Executable discovery is not proof of successful
operation. Read-only stages expose inspection, never preparation or installation.

The implementation owner is `src/server/technology/`; shared MCP result types live in
`src/shared/technology-capabilities.ts`. Both providers use the same tools and concise guidance.
Existing configured host executables remain optional fallbacks, not required package locations.

## Research and command execution

Research uses the bundled AnySearch skill registered in `agents/bundled-skills/anysearch.ts`.
Startup installs and integrity-checks its canonical upstream repository; both providers receive
that same skill without user-global configuration. Its Node CLI is staged with CommonJS package
metadata. Claude’s native WebFetch/WebSearch are explicitly denied; Codex web search is disabled.
Sandboxed command networking supports the skill and model-run package managers. Node honors the
sandbox proxy through `NODE_USE_ENV_PROXY`. On macOS, Claude can access the system DNS socket
`/private/var/run/mDNSResponder` so it can resolve the proxy's `localhost` address, and
`com.apple.trustd.agent` for Python/Go TLS certificate verification. Commands retain
filesystem sandboxing; npm and XDG caches live under the job's `.cache` directory. External content
remains reference data. AnySearch is Apache-2.0; the browser bundler esbuild is MIT.

Claude's SDK sandbox denies the credential environment variables declared in
`runtime/credential-environment.ts` to sandboxed Bash commands. The same constants are used by
host configuration, login synchronization, capability setup and tests. SDK authentication and
host MCP capabilities retain their credentials; the Bash deny policy does not isolate those host
processes. Shell scripts cannot rely on the denied variables for API authentication.

Codex uses the isolated SDK directory for both `CODEX_HOME` and the process home, so native
skill discovery does not import the user's unrelated `~/.agents/skills` instructions.

## Dependency lifecycle

Pass the caller's `AbortSignal` through queues, MCP requests and process helpers, and await
cleanup before returning. Both SDK adapters use shared process scopes; resource factories
with a separate close lifetime use `createProcessScope`. Register auxiliary project work
through `Workflow.projectDependency` rather than launching unowned background tasks.
App-shared services retain app ownership. See
[project work and cancellation](../../../../docs/process-lifecycle.md) for the lifecycle,
cleanup failure contract and tests.

## Bevy

JEV can choose [Bevy](https://bevy.org/) in the existing visual authoring decision.
The build agent pins a version in a project-local Cargo crate, checks the GPU and
compiles a native headless scene. See the Bevy repository's
[headless renderer example](https://github.com/bevyengine/bevy/blob/main/examples/app/headless_renderer.rs)
at the pinned version.

Builds using Bevy 0.20 can read the
[community Bevy skills](https://github.com/chrisgliddon/bevy-skills) from their
local task inputs. Both providers start with the router and read the guides it
points to. If the installed Bevy version differs or the local guides are
unavailable, the build uses the official example for its Bevy version.
See [dependency upgrades](../../../../docs/dependency-upgrades.md#bevy-managed-updates)
for installation and version checks.

The build-only `bevy.render_frames` tool runs the compiled scene through Kiteva's
render sandbox. The executable takes `--output-dir`, `--width`, `--height`,
`--fps` and `--frames` and writes numbered PNGs from `frame-000000.png`.
The tool checks the count, names, format and dimensions before publishing the
sequence under the project's media assets. A repeated shot name cannot overwrite a
saved sequence. A failed or cancelled run discards its staged frames. The tool
has a three-minute timeout and requires a prepared executable. The project
renderer uses the resulting assets and performs final export.

## LPC characters and PixelFX environment effects

Kiteva offers two optional asset capabilities alongside the primary authoring
resource. When either is available, the same JEV request asks a second question
about which of the available asset tools to use. The result and the primary
choice appear together in Governance. A build can pair either or both tools
with Bevy, another primary resource, or local code.

- `lpc.list_parts` discovers compatible items by body layout and walk or idle
  animation. `lpc.build_character` layers selected sprites in upstream z-order.
  It reads the matching part definitions for each layer and uses CC0 or CC BY.
  When a layer's upstream credits permit OGA-BY 3.0, Kiteva uses that layer
  under CC BY 3.0 via [OGA-BY section 8(g)](https://static.opengameart.org/OGA-BY-3.0.txt).
  The rule applies to all eligible parts, including stock bodies, clothes and
  accessories. Credits record the selected licence and its basis. Kiteva's code is MIT.
  The adapter uses LPC's shipped PNGs, including available colour variants.
- `pixel_fx.list_effects` discovers installed effects in the environment
  categories. `pixel_fx.render_effect` uses the upstream CLI to export a seeded
  transparent sheet and matching frame data. Use frame rectangles, the loop
  flag and the pivot from the returned metadata when compositing.

Build outputs are under the project's assets directory. The LPC sheet includes a
machine-readable manifest and `CREDITS.md` with creators, sources, licence links
and changes. The PixelFX sheet includes its MIT licence and upstream notices.
Project source exports include these files. When publishing a standalone film,
include the generated LPC credits with the film, such as in its description.

See [pixel asset setup](../../../../docs/dependency-upgrades.md#pixel-asset-sources)
for the compatible revisions and the local benchmark command.
