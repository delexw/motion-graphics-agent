# Changelog

Notable changes to Kiteva. Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Cream Card Explainer Deck (`style-143`): a cream-paper explainer deck with a walking presenter character, layered entrances and exits, a side panel that docks into a floating white card, an attached mascot lower-third and stepped flow diagrams, learned from a source video's motion design only. Includes a reviewed technology choice, Chinese metadata, a frame-analysis record and a rendered preview built from the exact catalog prompt on the catalog's shared preview subject. The catalog now contains 143 Motion Graphics.

- Optional preview notifications: a bell switch beside the language switch plays a short chime and shows a browser notification when every preview direction of a project finishes. Clicking the notification opens the project. Off by default; the choice is remembered in this browser.

### Changed

- Declare every Python speech requirement as a range up to the next major version (like npm's `^`) instead of an exact version. Dependabot proposes major upgrades as PRs, and a new CI job installs every speech engine's libraries at the newest allowed versions and checks that they still provide every function, parameter and result shape Kiteva's adapters use. It replaces model objects with fakes, so it downloads no models. An incompatible upgrade fails before it merges. The Ming runtime check accepts any MLX-Audio release inside its range, and a test rejects exact pins in Python requirements and `package.json`.

- The MCP `get_idea_options` tool now lists every optional idea setting with its default, and agents ask the user about each one before `create_idea` instead of silently using defaults.

- `install.sh` now installs Ming TTS on Apple Silicon by default, and `--speech ming` installs only Ming. Intel Macs skip it.

- Run formatting, lint, build and the complete test suite for every PR; allow every Dependabot update to auto-merge only after full-suite and native Windows CI succeed.

- Use compatible npm dependency ranges, separate daily compatible updates from majors, and monitor Python requirements and GitHub Actions. Keep security alerts enabled.

### Fixed

- Style previews could stay paused with no video after opening. When the browser was busy it delivered several visibility changes at once, and the viewport visibility check read the oldest one. It now reads the newest.

- Stopping a project during a website sign-in no longer fails while closing the browser. Closing skipped saving cookies only when the browser had disconnected, so it read cookies from a browser the stop was already shutting down.

- The style suggestion test measures the visible suggestion row once it has a size, instead of the first matching row, which could be one not yet laid out.

- A fresh Mandarin Pocket TTS install picked Pocket TTS 3.3.0, which crashes the community checkpoint's inference code. Its range now stops below 3.1.

- Ming TTS setup failed its runtime check because the catalog expected a different MLX-Audio version from the one setup installed. The check now reads the requirements file directly.

- Leave renderer state folders out of published style preview sources.

- Serialize the full-suite browser/render workload on standard macOS runners to avoid competing rendering processes without weakening individual test deadlines.

- Use native locator readiness checks for preview hover and suggestion selection, avoiding stale browser handles during CI layout changes.

- Close sign-in test sessions before cancellation and restore launch mocks before fallible cleanup, preventing cross-scenario recursion.

- Move full-suite CI to supported macOS 15 runners after macOS 14 retirement. Install renderer-matched Chromium and declare browser test motion preferences explicitly instead of inheriting hosted accessibility defaults.

- Upgrade vulnerable npm dependency chains and add targeted compatible overrides for Undici, KaTeX and the existing Webpack floor; raise the Mandarin PyTorch security minimum to 2.13.0.

## [1.1.0] — 2026-11-08

Image-guided procedural 3D authoring, project-owned agent assets and expanded Motion Graphics.

### Added

- Project-owned MCP asset imports and draft/project attachment management, with matching interface limits, separate video references and FLAC music uploads.
- img2threejs procedural 3D authoring for Claude and Codex, with JEV comparison against Anatomy and other resources, scoped image evidence, and composition-time model/camera helpers.
- Printed Spark Collage (`style-142`) with a rendered preview, Chinese metadata, supporting-style guidance and exact prompt-binding provenance. The review retains known visual differences from its reference.
- Boxed-Word Active Relay (`motion-050`) with adjacent-word highlight overlap, a smaller completed-line history block and deterministic seeking. The catalog now contains 142 Motion Graphics and 50 motions.

### Changed

- Run local preview-repair and page-validation checks without opt-in flags; remove four desktop/external-runtime-gated smoke tests and their unused recording fixture, with verification limits documented.
- Refresh img2threejs from the latest default-branch commit at every backend startup, matching Anatomy, with integrity-checked offline reuse.
- Review 88 Motion Graphic drawing, motion and supporting technologies separately from project composition and export. Reject project renderers in every per-MG selection role and replace stale review instructions when reviewing again.

### Fixed

- Allow generated subtitles without requiring narration, while preserving project language and subtitle settings.
- Update Windows browser setup and cache isolation; remove the obsolete deleted-test path from its native contract checks.

This is a GitHub source release. It does not publish an npm package or bundle desktop installers, local models or downloaded authoring skills. Windows support remains experimental.

## [1.0.0] — 2026-10-30

Kiteva — AI Motion Graphics Agent now lives at `delexw/motion-graphics-agent`. This release brings together the production workflow improvements since v0.4.0.

### Added

- Read-only Production Desk with timeline inspection, source audio waveforms and inline storyboard viewing.
- Ming 3.0 TTS 0.5B narration with neutral voices, supported-language selections and original narrator cloning.
- Shared visuals with language-specific narration and subtitle tracks, plus cue-level subtitle progress.
- Refinement history, attachments and question/answer continuity, including cancelled versions and monotonically increasing version numbers.

### Changed

- Separate music and SFX source files with timed placements; the agent retains ownership of the final music/SFX mix.
- Centralized workspace paths separate render artifacts and assets from logs, diagnostics and runtime data.
- Bounded factual cache evidence replaces Haiku change summaries; deterministic checks handle provable cache decisions.
- Structured correction outcomes escalate unsuccessful Haiku repairs to the main model with context.
- Activity history loads recursively on demand and releases collapsed branches; playback uses the media clock and avoids competing audible players.

### Fixed

- Brief recovery and draft removal, shared attachment previews, normalized download names and consistent project controls.
- Duration validation accepts the target length within five seconds; renderers retain their native execution defaults.
- Shared credential boundaries and test guards prevent codebase tests from using real provider credentials or external APIs.

This is a GitHub source release, without desktop installers, npm publication, bundled local models or downloaded upstream skills. Windows support remains experimental. Existing Qwen speech selections are normalized to the retained narration providers; both Qwen providers have been retired.

## [0.4.0] — 2026-10-25

Kiteva adds model-owned technology setup, documentation research and clearer production controls, with 141 Motion Graphics and 49 motions.

### Added

- **Project-local technology capabilities.** Both providers can inspect tools through Creative Pool MCP, prepare their own JavaScript, Python or other environments, and bundle browser libraries, CSS and assets without relying on Kiteva's dependency tree. Bundling never installs packages. [Implementation](https://github.com/delexw/motion-graphics-agent/commit/b5ca0fe).
- **Bundled AnySearch research.** Read tool documentation, CLI parameters, repository examples and source code through a verified workspace skill. Native provider web search/fetch is disabled; sandboxed setup and research use project-local caches. [Implementation](https://github.com/delexw/motion-graphics-agent/commit/b5ca0fe).
- **Model-called narration tools.** Create and edit timed narration through internal MCP while the application retains measured scheduling, final mixing and validation. [Narration and workflow controls](https://github.com/delexw/motion-graphics-agent/commit/7827aaf).
- **Pixel RPG Quest Explainer and Step-Tick Slot Refill.** New reviewed metadata, an authored preview and a seekable motion study bring the catalog to 141 Motion Graphics and 49 motions. [Catalog addition](https://github.com/delexw/motion-graphics-agent/commit/84bd05b).
- **Shared color chips.** Prompt displays and editors show compact color swatches alongside existing style and motion mentions. [Prompt controls](https://github.com/delexw/motion-graphics-agent/commit/7827aaf).

### Changed

- **Focused corrections retain accepted fields.** Shared recursive merging preserves omitted manifest values, including shot lists and soundtracks; changed arrays replace rather than append. Model instructions reinforce the same boundary. [Workflow controls](https://github.com/delexw/motion-graphics-agent/commit/7827aaf).
- **Provider-independent activity.** Reads, file updates, checks, installation and bundling share work categories; repeated named actions show the latest outcome without exposing execution nesting. Different models may still need different calls and correction rounds. [Activity normalization](https://github.com/delexw/motion-graphics-agent/commit/b5ca0fe).
- **Governance and cache settings.** Separate uncached input, cache reads, cache writes and output, show API-rate cost ranges when usage details are incomplete, and use five-minute Claude prompt caches. [Usage accounting](https://github.com/delexw/motion-graphics-agent/commit/7827aaf).
- **Capability documentation.** Refresh the architecture, Mermaid diagrams and bilingual dated README history. Anatomy and AnySearch are staged from verified upstream installations; downloaded skills and local models are not source-release assets. [Documentation](https://github.com/delexw/motion-graphics-agent/commit/b5ca0fe).

### Fixed

- **Playback and review evidence.** Align windowed cursor tracks and assess sampled export frames during final review. [Cursor fix](https://github.com/delexw/motion-graphics-agent/commit/7568781), [sampled review](https://github.com/delexw/motion-graphics-agent/commit/c004af1).
- **Question and source boundaries.** Pause unanswered questions before storyboard validation; keep document names and paths out of visible or spoken video content unless explicitly requested. [Fixes](https://github.com/delexw/motion-graphics-agent/commit/b5ca0fe).
- **Previews, translations and outcomes.** Stabilize mention hover playback, translate new catalog details, and retain failure states for Codex MCP calls, commands and file changes. [Fixes and regression coverage](https://github.com/delexw/motion-graphics-agent/commit/b5ca0fe).
- **Vintage style guidance.** Clarify visual requirements without encouraging simplified drawing. [Metadata correction](https://github.com/delexw/motion-graphics-agent/commit/084e43d).

This is a GitHub source release, without desktop installers, npm publication, bundled local models or downloaded upstream skills. Windows support remains experimental; native CI results describe the tested runner, not every installation.

## [0.3.0] — 2026-10-23

Kiteva adds chapter-based application demos, timed narration and renderer-owned reuse, with clearer production activity.

### Added

- **Chapter-based demo capture.** Save a validated storyboard before recording, use fresh chapter sessions, and hand measured, accepted footage to narration and assembly.
- **Timed script items.** Configure separate narration windows, scripts or generation instructions, captions and voices. Reuse a persistent local Pocket TTS worker.
- **Render reuse and refinement checkpoints.** Cache verified Multiplane shots, retain source context for revisions and validate dependencies and media before reuse.
- **Motion clip mentions and visual-stage contracts.** Use shared mention previews and explicit, seekable calculation and application stages.

### Changed

- **Native OpenScreen cursor logging.** Pass timestamped browser action events unchanged to `setPointerTrack` after recording. Native fullscreen capture aligns page and window coordinates without toolbar-offset calculations; OpenScreen owns cursor rendering.
- **Claude native planning.** Use SDK plan mode with an automatic structured handoff, followed by code-owned validation and stage-specific tool controls.
- **Capture presentation.** Fix cursor size at 1.5, disable smoothing and use consistent framing across chapters.

### Fixed

- **Chapter timing recovery.** Fit complete action sequences with native speed regions and allow up to ten chapter-local retries, preserving approved budgets and accepted captures.
- **Production activity.** Group chapter work and renderer progress, show measured timing and retry counts, and reduce duplicate activity rows.
- **Settings and authoring visibility.** Clarify attached materials, selected resources and probabilities, and keep README history collapsed by default.

This is a GitHub source release, without desktop installers or npm publication. Native Windows CI passed for the included code changes; Windows support remains experimental.

## [0.2.0] — 2026-10-22

Kiteva adds style-driven previews, editable video exports and native demo capture, with shared planning and renderer policies. The catalog now contains **140 Motion Graphics and 48 motions**.

### Added

- **Selected-style preview directions and inline style mentions.** Keep previews enabled with fixed styles, insert `@` references in the idea editor, and inspect the same animated style preview across the editor, conversations and project board. [Preview workflows](https://github.com/delexw/motion-graphics-agent/commit/43532cf).
- **Editable project downloads.** Export renderer sources, available media, an OpenTimelineIO timeline and SRT subtitles whenever files exist, including incomplete or failed builds. [Editable exports](https://github.com/delexw/motion-graphics-agent/commit/d6e9ae5).
- **Expanded creative tools and catalog.** Add Particle Flow Network and Vintage Rubber Hose Animation, component-authoring integrations and uniform random creative directions. [Authoring capabilities](https://github.com/delexw/motion-graphics-agent/commit/9c29942), [random directions](https://github.com/delexw/motion-graphics-agent/commit/3034ac4), [catalog and authoring](https://github.com/delexw/motion-graphics-agent/commit/d38e580), [rubber-hose style](https://github.com/delexw/motion-graphics-agent/commit/43532cf).

### Changed

- **Shared plan-before-build workflow.** Both providers validate a main-model plan before a new preview or full build, preserving the SDK session and correcting rejected structured plans before implementation. [Planning](https://github.com/delexw/motion-graphics-agent/commit/43532cf).
- **Native OpenScreen demo capture.** Record a dedicated browser window with explicit model-planned zoom/focus regions, automatic zoom disabled and cursor smoothing at 0.15. Extend browser capabilities and remove application-imposed capture budgets. [Native capture](https://github.com/delexw/motion-graphics-agent/commit/338e87a), [capture lifecycle](https://github.com/delexw/motion-graphics-agent/commit/4c97e7b).
- **Central renderer policy.** Prompts, execution and reproduction instructions share renderer-owned flags and stages. Previews skip QA and automatic repair loops; full films retain QA and runtime determinism verification. Multiplane inspect, verify and render use `--no-lint`. [Shared policies](https://github.com/delexw/motion-graphics-agent/commit/233ceeb), [execution](https://github.com/delexw/motion-graphics-agent/commit/43532cf).
- **Standard MIT license.** Replace the custom non-commercial license with MIT; third-party components retain their own terms. [License](https://github.com/delexw/motion-graphics-agent/commit/fa678e0).

### Fixed

- **Editor and project visibility.** Resize the idea editor from its top edge, reuse the full-width style picker, show route-appropriate activity, and inspect selected authoring resources and probabilities in Governance. [Editor and Governance](https://github.com/delexw/motion-graphics-agent/commit/43532cf).
- **Production reliability.** Improve guarded brief corrections, SDK execution policy, storage contention handling, independent Multiplane shot rendering and stale frontend asset responses. [Brief corrections](https://github.com/delexw/motion-graphics-agent/commit/e07b55c), [execution policy](https://github.com/delexw/motion-graphics-agent/commit/885af5b), [rendering and storage](https://github.com/delexw/motion-graphics-agent/commit/541d6bb), [segmented shots](https://github.com/delexw/motion-graphics-agent/commit/5b610b0), [frontend assets](https://github.com/delexw/motion-graphics-agent/commit/43532cf).

This is a GitHub source release, without desktop installers or npm publication. Windows remains experimental; native CI results describe the tested runner, not every Windows installation.

## [0.1.0] — 2026-10-18

The first source release of Kiteva: a personal creative workspace that turns ideas and references into Motion Graphic films and interactive pages.

### Added

- **Creative workspace and production workflow.** Create a brief, explore visual directions, review previews, build a full film, and inspect its Storyboard. Claude and Codex providers support configured API keys or signed-in subscriptions. [Initial application](https://github.com/delexw/motion-graphics-agent/commit/dd83243).
- **138 Motion Graphics and 48 motions.** Browse reviewed examples, combine treatments for a project, and use deterministic, seekable animation. HyperFrames is the default renderer, Multiplane is a trial option, and Remotion is a conditional fallback. [Catalog refresh](https://github.com/delexw/motion-graphics-agent/commit/571b25a), [latest additions](https://github.com/delexw/motion-graphics-agent/commit/63cadd4).
- **Shared headless website tools.** Both providers can inspect reference websites and capture silent walkthrough footage into the project workspace. [Website capture](https://github.com/delexw/motion-graphics-agent/commit/60bec38).
- **Local narration and bilingual delivery.** Kokoro and Pocket TTS offer configurable voices, loudness matching, volume and speaking speed. English and Simplified Chinese video text, narration and subtitles are localized during governed project builds; Mandarin Pocket TTS uses a separate community-model runtime. [Pocket TTS](https://github.com/delexw/motion-graphics-agent/commit/26187b3), [language support](https://github.com/delexw/motion-graphics-agent/commit/63cadd4).
- **Provider workspace skills.** Anatomy installs or updates over HTTPS at startup, with verified offline fallback. Both providers use the same staged local skill; upstream files and model weights are not bundled in the release. [Skill installation](https://github.com/delexw/motion-graphics-agent/commit/63cadd4).
- **Native Windows verification.** An experimental Windows sandbox backend includes filesystem, networking, cancellation and render checks. These checks passed on the Windows CI runner; this does not establish testing on every Windows 10/11 installation. [Native Node capture fix](https://github.com/delexw/motion-graphics-agent/commit/0d972f1), [successful verification](https://github.com/delexw/motion-graphics-agent/actions/runs/39096394369).

### Changed

- **Clearer Activity and Governance.** Task-specific activity keeps raw internal content hidden; provider usage is recorded for project cost tracking. [Activity improvements](https://github.com/delexw/motion-graphics-agent/commit/d02980e).
- **Documented setup and source distribution.** English and Chinese READMEs include an introduction film, desktop and Storyboard screenshots, architecture, technology inventory and cost notes. This is a source release without desktop installers or npm publication. [Documentation](https://github.com/delexw/motion-graphics-agent/commit/c55e0d6).

### License

Kiteva uses the [MIT License](LICENSE). Third-party components retain their own licenses.

[0.1.0]: https://github.com/delexw/motion-graphics-agent/releases/tag/v0.1.0
[0.2.0]: https://github.com/delexw/motion-graphics-agent/releases/tag/v0.2.0
[0.3.0]: https://github.com/delexw/motion-graphics-agent/releases/tag/v0.3.0
[0.4.0]: https://github.com/delexw/motion-graphics-agent/releases/tag/v0.4.0
[1.0.0]: https://github.com/delexw/motion-graphics-agent/releases/tag/v1.0.0
