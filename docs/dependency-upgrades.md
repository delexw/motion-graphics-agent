# Dependency upgrade lifecycle

## Update owners and triggers

| Dependency                               | Update trigger                                                                                                                                    | Owner                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Managed Audio Studio MCP                 | Every backend startup and `install.sh`, for installed managed runtimes; manual `npm run audio-studio:update`                                      | `src/server/agents/capabilities/audio-studio/installation.ts`                         |
| Explicit `AUDIO_STUDIO_MCP_COMMAND`      | Operator-managed; Kiteva never replaces it                                                                                                        | Configured external installation                                                      |
| LPC and PixelFX                          | `install.sh` provisions missing sources. Backend launch checks installed sources against Kiteva's pinned revisions.                               | [Pixel asset sources](#pixel-asset-sources)                                           |
| Bundled skills                           | Every backend startup and `install.sh`, using verified immutable revisions                                                                        | [Bundled skill installation](../src/server/agents/bundled-skills/README.md)           |
| React Bits / Animate UI registry content | Upstream reads when a new registry client requests content; cached within that client                                                             | [Component capabilities](../src/server/agents/capabilities/README.md)                 |
| npm dependencies and SDKs                | `install.sh` refreshes Claude/Codex and the compatible DeepSeek SDK/runtime pair; other packages use lockfile install/update; no runtime hot swap | `package.json`, `package-lock.json` and [dependency security](dependency-security.md) |

Restarting an MCP connection discovers its tools; it does not itself upgrade the
server or prove model readiness. Keep executable/package versions, source revisions,
model weights and copied project artifacts distinct.

## Bevy managed updates

The shared updater checks crates.io for the latest stable Bevy release at launch
and during `install.sh`. The macOS installer provisions Rust and Cargo when needed.
Kiteva resolves an exact Bevy version, generates a Cargo lockfile, vendors the crates
and verifies that Cargo can resolve the locked graph offline. The check does not
compile a scene or exercise the GPU.

A cross-process lease serialises maintenance. Only a verified dependency bundle
becomes current. A failed update retains the previous verified bundle, and prior
release directories stay available for projects pinned to them. New build turns
receive the current manifest and Cargo configuration. Scene compilation happens
in each project and uses the shared vendored sources. See the
[Bevy agent capability](../src/server/agents/capabilities/README.md#bevy).

The shared bundled-skill updater reads the registry entry for the MIT-licensed
[community Bevy skills](https://github.com/chrisgliddon/bevy-skills). The entry
pins the reviewed revision and limits it to Bevy 0.20.
Kiteva retains the licence and Markdown guides, verifies their hashes, and
reuses the verified revision offline. The guides are optional. An unavailable
or incompatible collection leaves Bevy available with the official headless
renderer example.

## Audio Studio managed updates

Both backend startup and `install.sh` call `src/server/dependencies.ts` through the
shared `refreshManagedDependencies` entry point. The installer invokes
`npm run dependencies:update` before building. `--skip-audio-studio` (including
`--minimal`) skips Audio Studio maintenance for that installer run. Startup updates
installed Audio Studio runtimes, but does not install an absent optional runtime.
The dedicated `npm run audio-studio:update` command can install it explicitly.

Backend startup checks the default-branch HEAD of the fixed official Audio Studio
repository. Managed setup supports Apple Silicon macOS and Windows x64 with the
upstream NVIDIA/runtime prerequisites. Other platforms retain the explicit external
command route. An external command is never cloned, overwritten or upgraded by Kiteva.

The updater takes a cross-process lease and resolves an exact source commit. A changed
commit gets a new directory under `.data/audio-studio-installations/`, with its own
source and Python environment. Existing legacy `.data/audio-studio-mcp/` and managed
revisions remain unchanged. The updater never renames a built Python environment,
because executable entry points contain absolute paths.

Source identity, tracked file paths, license, lockfile, source hashes and the executable
are checked. The updater requires an existing `git` and `uv`, then runs the official
platform installer with weights disabled and noninteractive flags. This is trusted
host maintenance that executes upstream setup code; it is not an agent tool or a
sandboxed job, and it differs from bundled-skill archive installation. Review the
upstream source and setup boundary when changing this mechanism.

After setup, Kiteva starts the candidate MCP, performs its handshake and lists tools.
All four supported audio operations must expose object input schemas. The updater
never calls them and does not request model preloading or audio generation. This
check does not certify model weights, GPU readiness, audio quality or compatibility
of every generation argument.

Only a verified candidate replaces `current.json`, by a same-directory atomic rename.
The pointer records source commit, upstream package version, platform/architecture,
source hashes, executable hash and install time. The local adapter's MCP protocol
version is not the upstream package version. New capability registrations resolve the
selected executable; already registered jobs retain their existing executable path.
Upgrades do not alter running job environments or replace shared model caches.

If the source commit is unchanged and the installation still verifies, startup checks
its MCP contract without reinstalling. Network, install or candidate-contract failure
keeps the previous pointer and rechecks that saved runtime. With no verified managed
installation, a legacy installation can be retained only after MCP verification.
If verification fails, report unavailability; do not silently generate with a broken
runtime. A startup maintenance error does not prevent the rest of Kiteva from serving.

Old revisions are retained for running tasks and recovery. Failed installation
directories may also remain for inspection; no automatic pruning deletes potentially
referenced environments. Package downloads may still be required for setup. Model
weights are separate: existing caches are reused and first real generation can still
report a missing model, license, device or runtime requirement.

## Manual retry and diagnosis

Run `npm run dependencies:update` for the shared skills/installed-MCP check, or
`npm run dependencies:update -- --skip-audio-studio` to set up pixel assets and check skills and Bevy.

Run `npm run audio-studio:update` to use the same managed updater without restarting
Kiteva. It prints the revision/version selected or the fallback/unavailability reason.
An unavailable installation exits unsuccessfully. A fallback message means an older
usable runtime was retained, not that the newest version installed successfully.
An explicit external command prints that its lifecycle remains operator-managed.

Inspect `.data/audio-studio-installations/current.json` for the selected source and
hash evidence. Never edit a revision in place or point at a directory that has not
passed validation. Stop referencing jobs before manually removing any old revision.
Do not delete model caches as part of routine MCP upgrades.

## Rules for new integrations

Every new third-party executable, MCP or bundled resource must name an upgrade owner
and document its update trigger, source, resolved version, verification, fallback,
concurrency and cancellation behavior. Register startup maintenance explicitly;
placing an updater file in the tree does not execute it. Preserve explicit user-managed
commands and running jobs. Never install or upgrade as a side effect of a generation
tool call. Use the existing lease/process helpers rather than duplicating lifecycle
code. Follow [SDK security](../src/server/agents/capabilities/README.md#sdk-tool-security-and-stage-selection)
and [environment boundaries](project-file-isolation.md#environment-and-sandbox-boundaries).

Test changes with local archives, command fixtures and MCP transports. Include new,
unchanged and failed updates, invalid contracts, damaged files, cancellation and
concurrent startup. Do not use live inference to verify upgrades. Audio Studio's
fixtures are `tests/integration/audio-studio-installation.test.ts` and
`tests/unit/audio-studio-startup.test.ts`.

## Audio Studio dependency layers

Audio Studio includes MCP tools, Python packages, the Stable Audio inference runtime,
platform backends and model weights. The installer owns Python dependencies and the
inference-runtime revision it declares; Kiteva does not independently advance that
runtime or GPU stack beyond upstream's compatible version. Mac uses the MLX setup;
Windows uses the upstream NVIDIA/CUDA setup. A release may change these declared
requirements, so installation verification and fallback remain necessary.

MCP code updates do not request weight downloads. Weight provisioning and first real
generation retain upstream license and device requirements. FFmpeg and other host
prerequisites follow the installer/platform setup, not the MCP handshake. Updating
one layer does not prove the remaining layers are installed or generation-ready.

## DeepSeek Harness SDK

The npm SDK and runtime are a matched release-candidate pair, recorded in the lockfile.
The same installer update step maintains the `dsh-cost-meter` plugin; its public
cost service and saved per-call result contract are checked by local fixtures.
The provider's [setup guide](../src/server/agents/deepseek/README.md) owns execution
limits. `install.sh` refreshes them through the normal dependency update step; backend
startup does not install or replace them. Never upgrade from the SDK's older `latest`
tag without checking its actual API and matching runtime. Run local SDK/permission
fixtures before accepting an update. Runtime subprocesses retain their loaded modules;
finish active jobs before dependency maintenance or restart. Failed installation must
not trigger a generation-time download or silently select another provider. The SDK/runtime and the `dsh-cost-meter` host plugin
are MIT licensed; upstream files and notices remain intact. Compatible nested overrides
keep the runtime's HTTP, MCP client and ZIP dependencies on patched releases.

## Pixel asset sources

`install.sh` installs LPC and PixelFX and keeps them in `.data/pixel-assets/`.
Use `--skip-pixel-assets` or `--minimal` to skip them. Rerun just the shared
dependency setup with `npm run dependencies:update -- --skip-audio-studio`.
Backend startup checks installed copies. A launch with no existing copy leaves
that optional capability unavailable until it is installed.

The [pixel asset source registry](../src/server/agents/capabilities/pixel-assets/sources.ts)
pins the benchmarked LPC and PixelFX revisions. The updater fetches the exact
commit, checks the revision and required files, then publishes a new source
directory and switches to it atomically. A per-source lease serialises concurrent
updates. A failed or cancelled update discards its staged files and retains any
verified previous checkout. Existing jobs can continue to use the revision they
started with. A clean manual checkout at the pinned revision stays usable.

Set absolute paths in `KITEVA_LPC_ROOT` and `KITEVA_PIXELFX_ROOT` to manage
either source yourself. Kiteva never updates those paths. Use sources you trust.
PixelFX runs its installed Node CLI, and Kiteva reads LPC definitions and
sprites directly. Neither source needs its own npm dependencies installed.
Generation uses local files and never installs or updates them.

After setup, run the local benchmark with a new output directory.

```sh
node --import tsx scripts/benchmark-pixel-assets.ts /absolute/path/to/new-benchmark-directory
```
