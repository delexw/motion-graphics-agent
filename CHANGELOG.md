# Changelog

Notable changes to Kiteva. Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Stageshow product-demo authoring, installed from its MIT-licensed upstream subdirectory at startup for Claude and Codex. Upstream files remain outside source control; installation retains revision hashes and asset notices.
- A pre-project JEV settings compatibility check with conflict reporting and Governance cost accounting.
- Server-side Governance pagination, indexed project search, persistent project filters and modular technology usage reporting.
- Shared backend/frontend agent guidance for module ownership, SDK permissions, tool boundaries, dependency maintenance and mocked third-party tests.
- A showcase of five actual MP4 films and two full-page HTML captures, including Playful Cat and the Swiss product walkthrough.

- Five composable motion techniques: Metaball Merge & Split (`motion-051`), Path Follow & Text on Path (`motion-052`), 3D Tile Flip (`motion-053`), Particle Glyph Assembly (`motion-054`) and Velocity Motion Blur (`motion-055`). Each entry has reusable prompt and implementation guidance, a seekable explorer preview, Chinese metadata and a frame-analysis record of a twelve-technique tutorial. The record also maps the seven techniques that existing motions and Motion Graphics already cover. The catalog now contains 55 motions.

- Cream Card Explainer Deck (`style-143`): a cream-paper explainer deck with a walking presenter character, layered entrances and exits, a side panel that docks into a floating white card, an attached mascot lower-third and stepped flow diagrams, learned from a source video's motion design only. Includes a reviewed technology choice, Chinese metadata, a frame-analysis record and a rendered preview built from the exact catalog prompt on the catalog's shared preview subject. The catalog now contains 143 Motion Graphics.

- Optional preview notifications: a bell switch beside the language switch plays a short chime and shows a browser notification when every preview direction of a project finishes. Clicking the notification opens the project. Off by default; the choice is remembered in this browser.

### Changed

- Project dependency manifests include model-selected technologies and required runtime packages. Source usage, runtime observations and dependency readiness are reported separately, including Python execution evidence.
- Narration and subtitle controls are configured independently per language and default to disabled; MCP exposes these choices for confirmation.
- Version refinements can update supported narration providers and production settings through a dedicated validated subworkflow.
- Stageshow owns its demo appearance unless the user specifies UI styling. Selected MGs contribute motion within that demo; planning, refinement, repair and review share the same ownership guidance.
- Startup and installation share managed dependency updates, including Audio Studio, with documented upgrade and offline fallback behavior.
- README daily history retains the latest three calendar days in New Zealand time and links to the archived daily history below.

- Both direct builds and generated directions now receive a shared motion-discovery route table. Motion Graphic candidates and motion `compatibility.good_fit` lists are recommendations rather than allowlists: models may search the full pool while preserving selected Motion Graphics, explicit `@` references, user requirements, exclusions and scene scope. Reading every motion or using a recommendation is not mandatory.

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

## Daily update archive

README recent updates cover today and the preceding two calendar days in New Zealand time. Move older daily entries here when updating the READMEs. Historical English and Simplified Chinese entries are preserved below; the versioned release notes above remain unchanged.

### 2026-11-10

- **Upgradeable dependency ranges, tested in CI:** Python speech requirements use ranges up to the next major version instead of exact pins, like npm's `^`. A new CI job installs every speech engine's libraries at the newest allowed versions and checks them against Kiteva's adapters without downloading models, and Dependabot auto-merge now waits for all three CI jobs. Mandarin Pocket TTS stays below 3.1 because its checkpoint breaks on newer releases. See [dependency policy](docs/dependency-security.md).
- **Ming TTS in the installer:** `./install.sh` installs Ming TTS on Apple Silicon by default, and `--speech ming` installs only Ming. A version mismatch that made Ming setup fail is fixed.
- **Preview notifications:** a bell switch beside the language switch plays a chime and shows a browser notification when every preview direction of a project finishes. It is off by default.
- **MCP asks about optional settings:** `get_idea_options` lists every optional idea setting with its default, and agents ask the user about each one before creating an idea.
- **Style previews no longer stay paused:** a style preview that opened while the browser was busy could stay paused with no video. It now plays once it is in view.
- **Cream Card Explainer Deck (`style-143`):** a cream-paper explainer deck with a walking presenter, a docking side panel and stepped flow diagrams. The catalog now has 143 Motion Graphics.

### 2026-11-09

**English**

- **Complete PR checks and Dependabot auto-merge:** every PR runs formatting, lint, build and the full test suite, alongside native Windows verification. All Dependabot ecosystems and version updates qualify after both jobs pass.

**简体中文**

- **完整 PR 检查与 Dependabot 自动合并：**每个 PR 执行格式、lint、构建及全量测试，并保留 Windows 原生验证；所有 Dependabot 生态及版本更新均在两项任务通过后自动合并。

### 2026-11-08

**English**

- **Dependency security maintenance:** compatible npm ranges, daily grouped updates, Python/Actions monitoring and targeted transitive fixes. The lockfile stays reproducible and security alerts stay enabled. See [dependency policy](docs/dependency-security.md).
- **v1.1.0 source release:** image-guided 3D authoring, project-owned MCP assets, 142 Motion Graphics and 50 motions. See the [release notes](CHANGELOG.md#110--2026-11-08).
- **Executable test coverage:** run the local preview-repair and page-validation checks by default. Remove four smoke tests requiring interactive desktop recording or an externally prepared package runtime, plus the unused recording worker. Documentation distinguishes local fixture coverage from actual desktop-recording verification.
- **Reference-image 3D authoring:** JEV can choose img2threejs alongside Anatomy and other resources, using the brief and scoped image evidence. Claude and Codex share the staged skill, absolute-time model/camera helpers and actual browser-review requirements. Like Anatomy, img2threejs updates from the latest default-branch commit at every backend startup, with verified offline reuse. See [the integration guide](docs/img2threejs.md).

**简体中文**

- **依赖安全维护：**使用兼容的 npm 版本范围、每日分组更新、Python/Actions 监控及针对性的间接依赖修复；保留可复现的锁文件和安全告警。详见[依赖策略](docs/dependency-security.md)。
- **v1.1.0 源码发布：**参考图三维创作、项目所有的 MCP 素材管理、142 个 Motion Graphic 和 50 个动作。详见[发布说明](CHANGELOG.md#110--2026-11-08)。
- **可执行的测试覆盖：**默认执行本地预览修复与页面验证检查，移除依赖交互式桌面录屏或外部准备的软件包环境的四项测试，以及不再使用的录屏辅助程序。文档明确区分本地测试覆盖与真实桌面录屏验证。
- **参考图三维创作：**JEV 根据简报和当前范围内的图像证据，在 img2threejs、Anatomy 等资源之间选择。Claude 与 Codex 共用工作区技能、绝对时间模型/相机辅助模块和真实浏览器审阅要求。img2threejs 与 Anatomy 一样，每次后端启动都更新到上游默认分支的最新提交，离线时使用已校验版本。详见[集成指南](docs/img2threejs.md)。

### 2026-11-03

**English**

- **Printed Spark Collage and Boxed-Word Active Relay:** add a reviewed print-collage Motion Graphic, an authored video preview and a seekable word-highlighting motion. The catalog now contains 142 Motion Graphics and 50 motions, with Chinese metadata and supporting-style guidance. The preview uses the published prompt with explicit bindings; its review records visual differences from the reference.
- **Focused Motion Graphic technology reviews:** assess 88 visual, motion and supporting tools separately from project composition and export. HyperFrames, Multiplane and Remotion remain project renderer choices and cannot be selected as per-MG technologies. Repeated reviews replace stale prompt guidance.

**简体中文**

- **印刷火花拼贴与逐词激活接力：**新增经过审阅的印刷拼贴 Motion Graphic、实际制作的视频预览和可跳转的逐词高亮动作。目录现包含 142 个 Motion Graphic 和 50 个动作，附有中文元数据及辅助风格搭配建议。预览使用正式提示词与明确的变量绑定，审阅记录保留了与参考视频的视觉差异。
- **聚焦 Motion Graphic 的技术审阅：**将 88 种视觉、动作和辅助工具与项目合成、导出流程分开评估。HyperFrames、Multiplane 和 Remotion 仍是项目渲染器选项，不再参与单个 MG 的技术选择；重复审阅会替换过期的提示词指导。

### 2026-11-01

**English**

- **MCP asset imports:** import local files or ComfyUI outputs into a saved draft or project through `import_asset`. Use `manage_idea_assets` to list available assets, attach them to the draft or remove their entries from the material shelf. MCP and the interface share file limits and attachment rules. Imported files are stored in Git-ignored runtime uploads. See [agent MCP](docs/agent-mcp.md).
- **Linked draft, asset and project IDs:** when `start_idea` creates a project from a saved draft, Kiteva keeps its attachment IDs and associates the imported files with that project. Updates reject outdated draft revisions and files belonging to another project.
- **Separate video references:** give MP4, MOV and WebM clips their own Videos section in the interface and MCP. Kiteva moves clips previously assigned to Images when loading a saved draft, preserving attachment IDs and notes. Music uploads also accept FLAC.
- **Concise agent briefs:** tool descriptions ask calling agents to preserve the user's requirements and keep prompts concise, leaving unspecified creative decisions to the selected main model, Claude Opus 5.5 by default.

**简体中文**

- **MCP 素材导入：**通过 `import_asset` 将本地文件或 ComfyUI 产物导入已保存的草稿或项目；通过 `manage_idea_assets` 查看可用素材、附加到草稿或从素材架移除条目。MCP 与界面共用文件限制和附件规则。导入文件保存在 Git 忽略的运行时目录。详见[智能体 MCP](docs/agent-mcp.md)（英文）。
- **关联草稿、素材与项目 ID：**`start_idea` 从已保存的草稿创建项目时，Kiteva 保留附件 ID，并将导入文件关联到该项目。更新操作会拒绝过期的草稿版本和属于其他项目的文件。
- **独立的视频参考：**界面和 MCP 为 MP4、MOV、WebM 片段提供独立的 Videos 分类。Kiteva 在加载已保存的草稿时迁移此前误归入 Images 的视频，保留附件 ID 和说明。音乐上传同时支持 FLAC。
- **简洁的智能体简报：**工具描述要求调用方保留用户需求并保持提示词简洁，将未指定的创意决策交给所选主模型，默认使用 Claude Opus 5.5。

### 2026-10-31

**English**

- **HTTP MCP for external agents:** search saved ideas and Motion Graphics, inspect available settings, save an Assistant draft, and explicitly start its build through the bundled `/mcp` endpoint. Tools share typed results and request validation, protect concurrent draft edits, and default to Claude Opus 5.5, Multiplane, 2K, 60 fps, Explore and three preview directions. See [agent MCP](docs/agent-mcp.md).
- **Dedicated local ports:** use `18419` for the interface and `18417` for the backend, with shared validation and matching proxies, origin checks and verification scripts. Invalid or colliding overrides fail explicitly; the frontend never silently takes another port.
- **Language downloads and embedded subtitles:** place language-specific video, audio and subtitle downloads in a wrapping horizontal panel on the download action. Restore narration subtitles authored inside the video, respect the project's subtitle setting, and remove the separate playback subtitle selector and duplicate browser overlay.
- **Full-build Desk artifacts:** read saved production and narration metadata directly, prefer current artifacts over inherited job metadata, and reject preview-length manifests and storyboards when inspecting a full build. Shared narration schemas keep browser and server readers aligned.
- **Creative selection and stable development:** encourage meaningful combinations beyond the smallest familiar set; cap the history preference contribution in code even when evaluator scores exceed their expected range. Ignore generated runtime files and downloaded authoring skills in the development watcher to prevent unwanted page reloads.

**简体中文**

- **面向外部智能体的 HTTP MCP：**通过应用内置的 `/mcp` 端点搜索已保存的想法和 Motion Graphic、查看可用设置、保存 Assistant 草稿，并明确启动构建。工具共用类型化结果与请求校验，保护并发草稿编辑；默认使用 Claude Opus 5.5、Multiplane、2K、60 fps、Explore 和三个预览方向。详见[智能体 MCP](docs/agent-mcp.md)（英文）。
- **独立本地端口：**界面使用 `18419`，后端使用 `18417`；共用校验，并同步代理、来源检查和验证脚本。无效或冲突的端口配置会明确报错，前端不会静默占用其他端口。
- **语言下载与内嵌字幕：**将各语言的视频、音频和字幕下载集中到下载操作的横向面板，空间不足时自动换行。恢复直接制作在视频中的旁白字幕，遵守项目字幕设置，移除独立的播放字幕选择器与重复的浏览器字幕覆盖层。
- **完整构建的制作台产物：**直接读取已保存的制作与旁白元数据，优先使用当前产物而非继承的任务元数据；查看完整视频时排除预览长度的制作清单和分镜。旁白结构定义由浏览器和服务器共享。
- **创意选择与稳定开发：**鼓励超出最小常见组合的有意义搭配；即使评估器返回超出预期范围的分数，也在代码中限制历史偏好的贡献。开发文件监听排除生成的运行时文件和下载的创作技能，避免意外刷新页面。

### 2026-10-30

**English**

- **v1.0.0 source release:** publish the production workflow improvements below under the renamed `motion-graphics-agent` repository. See the [changelog](CHANGELOG.md#100--2026-10-30).

- **Production Desk and inline storyboard:** open both viewers inside centered, nearly full-window dialogs. Desk provides read-only playback, seeking, zoom, clip inspection and real audio waveforms; its larger preview leaves tracks below. Saved production metadata is available during generation, before the agent returns its accepted response. See [Production Desk](docs/production-desk.md).
- **Separate audio sources:** new full builds retain music-only and individual SFX files with timed placements and gains in a shared `audioTracks` manifest. The agent still prepares the final music/SFX mix through the existing renderer handoff; Desk inspects the separate sources rather than treating the merged soundtrack as music-only. Application-owned narration mixing is unchanged, and legacy projects keep their fallback.
- **Playback synchronization:** move the Desk cursor with CSS transforms using the media clock, without frame-by-frame React updates or repeated layout positioning. Opening Desk pauses background audio; shared video players prevent competing audible playback while leaving silent previews running.
- **Ming narration:** add the local Ming 3.0 TTS 0.5B provider, its supported-language voice catalog and neutral voice controls. Retire both Qwen providers, retain the original narrator reference for Ming cloning, and normalize saved legacy speech selections. Narration guidance now asks for a connected story with natural chapter transitions. See [Ming TTS](docs/ming-tts.md).
- **Shared project workspace:** centralize artifact, asset, diagnostic and runtime paths for build agents, correctors, capture, narration, exports and cache recovery. Render inputs stay under artifacts; logs and task context remain separate. Existing workspaces and recovery checkpoints use explicit layout compatibility. See [project workspace](docs/project-workspace.md).
- **Cache evidence and correction outcomes:** replace the Haiku change-summary step with bounded factual evidence for JEV, preserving hash checks and concrete cache-restore reporting. Corrections return structured fixed/refused/unresolved outcomes, escalate non-repairs to the main model and retain reasons for narrowly scoped bypasses. Renderer execution uses native defaults. See [cache recovery](docs/render-cache-recovery.md) and [correction outcomes](docs/video-correction-outcomes.md).
- **Consistent project controls:** recover from a broken brief without losing the option to remove its draft, copy style metadata, and name downloads from the normalized style and version. Storyboard actions use matching icons and lowercase labels; activity grouping and render progress keep their task hierarchy.
- **Credential boundaries and verification:** share credential environment names across SDK configuration, child processes and provider tests; deny credential access in agent shell tools while retaining required SDK authentication. Codebase tests clear provider credentials and block real external API calls. A separate live 10-second project verified the model-created music/SFX mix, saved source clips and Desk waveforms.

**简体中文**

- **v1.0.0 源码发布：**在更名后的 `motion-graphics-agent` 仓库发布以下制作流程改进。详见[更新日志](CHANGELOG.md#100--2026-10-30)（英文）。

- **制作台与内嵌分镜：**两个查看器均使用居中、接近全窗口大小的弹窗。制作台支持只读播放、定位、缩放、片段详情和真实音频波形；放大预览后，轨道排列在下方。生成期间即可读取已保存的制作元数据，无需等待 agent 返回最终结构化响应。详见[制作台](docs/production-desk.md)（英文）。
- **独立音频源：**新的完整视频构建在共享 `audioTracks` 清单中保存纯音乐、各个音效文件、时间位置和音量。agent 仍通过现有渲染器交接流程制作音乐与音效的最终混音；制作台展示独立源文件，不再把混合音轨当作纯音乐。应用负责的旁白混音保持不变，旧项目保留原有回退方式。
- **播放同步：**制作台游标使用媒体时钟和 CSS transform 移动，不再逐帧更新 React 状态或反复计算布局位置。打开制作台会暂停背景音频；共享视频播放器阻止多个有声视频同时播放，静音预览不受影响。
- **Ming 旁白：**新增本地 Ming 3.0 TTS 0.5B 提供方、所支持语言的音色目录及无情绪音色设置。移除两个 Qwen 提供方，保留原始旁白参考音供 Ming 克隆，并兼容旧语音选择。旁白指引要求连贯叙述和自然的章节衔接。详见[Ming TTS](docs/ming-tts.md)（英文）。
- **共享项目目录：**统一构建 agent、修正 agent、录屏、旁白、导出和缓存恢复所使用的成品、素材、诊断与运行时路径。渲染输入位于 artifacts 下，日志与任务上下文独立存放；已有工作目录和恢复检查点采用显式的目录兼容机制。详见[项目目录](docs/project-workspace.md)（英文）。
- **缓存证据与修正结果：**用有大小限制的事实证据替代 Haiku 变更摘要，交给 JEV 判断，保留哈希检查与实际缓存恢复记录。修正返回 fixed/refused/unresolved 结构化状态；无法修复时升级到主模型，并记录仅针对具体问题的绕过理由。渲染执行采用原生默认设置。详见[缓存恢复](docs/render-cache-recovery.md)与[修正结果](docs/video-correction-outcomes.md)（英文）。
- **一致的项目操作：**简报加载失败时仍可删除草稿；支持复制风格元数据，下载名称使用规范化风格名与版本号。分镜操作采用一致的图标和小写英文标签，活动分组与渲染进度保留任务层级。
- **凭据隔离与验证：**SDK 配置、子进程和提供方测试共用凭据环境变量名称；agent 的命令行工具禁止访问凭据，同时保留 SDK 必需的认证。代码库测试清空提供方凭据并阻止真实外部 API 请求；另行运行的真实 10 秒项目验证了模型制作的音乐与音效混音、独立源文件及制作台波形。

### 2026-10-29

**English**

- **Refinement continuity and versions:** preserve earlier requests, question/answer history and image references; allow excluding prior requests before submission. Resume verified build sessions, including cancelled versions, without letting helper sessions replace them. Versions can be deleted with confirmation, and their numbers are never reused. See [video refinement](docs/video-refinement.md).
- **Activity history on demand:** expand any parent to load its immediate children through one recursive component and shared grouping logic. Remove manual paging buttons, load more siblings on scroll, release collapsed branches, virtualize long lists and use consistent indentation. Finished jobs no longer leave unresolved entries spinning while another version runs. See [activity history](docs/activity-history.md).
- **Shared loading and result UI:** reuse loading indicators with visible text; group revisions in one card with wrapping version controls, overlay playback controls, generated timestamps and consistent icon actions. Conversation shows narration providers/voices and uses shared image/document attachment previews.
- **Language and subtitle controls:** global selected languages govern matching narration and subtitle tracks, with one voice configuration per language and global subtitle visibility. Timed script items inherit these choices; subtitle generation reports progress in cues. See [video languages](docs/video-languages.md).
- **Rendering and capture recovery:** accept video duration within five seconds of the requested target, preserve eligible render cache across repairs, and exclude runtime/dot-folder noise from change summaries. Separate chapter timing retries from planning, retain capture diagnostics and keep cancellation scoped to owned dependencies. See [render cache recovery](docs/render-cache-recovery.md).
- **Portable style assets:** Production Theatre metadata includes its canonical crew CSS and role markup, without imports from application source. A JPEG logo is available alongside the existing brand assets.
- **Governance and local configuration:** expose combination and render-cache decisions, keep Claude SDK costs and incremental Codex estimates distinct, and use `TYPESAFE_API_KEY` as the single JEV key. Tests use local fixtures/mocked transports and block external provider requests; downloaded agent skills remain outside Git.

**简体中文**

- **调整历史与版本：**保留之前的调整请求、问答记录和图片参考，提交前可排除不再需要的请求。续接经过验证的构建会话，支持从已取消的版本继续，辅助会话不再覆盖构建会话。确认后可删除版本，已删除的版本号不会复用。详见[视频调整](docs/video-refinement.md)（英文）。
- **按需加载活动历史：**展开任意父节点时，使用同一递归组件和共享分组逻辑加载直接子节点。移除手动翻页按钮，滚动时加载更多同级条目；收起后释放子树，长列表使用虚拟化，并统一缩进。其他版本仍在运行时，已结束任务中的未完成条目不再持续转圈。详见[活动历史](docs/activity-history.md)（英文）。
- **共享加载与结果界面：**复用带可见文字的加载组件；同一方向的版本集中在一张卡片中，版本按钮自动换行，播放控件覆盖在画面内，并统一生成时间和图标操作。Conversation 显示旁白提供方与音色，图片和文档附件共用预览方案。
- **语言与字幕控制：**全局所选语言统一决定对应的旁白和字幕轨道，每种语言配置一个音色，全局控制字幕显示。定时脚本条目继承这些选择，字幕生成按 cue 显示进度。详见[视频语言](docs/video-languages.md)（英文）。
- **渲染与录屏恢复：**视频时长允许在目标时长前后五秒内浮动；修复后保留符合条件的渲染缓存，变化摘要排除运行时文件和隐藏目录噪声。章节时长重试与规划分离，保留录屏诊断，并将取消限制在任务拥有的依赖进程内。详见[渲染缓存恢复](docs/render-cache-recovery.md)（英文）。
- **可移植风格资源：**Production Theatre 元数据包含标准角色的 CSS 和各角色标记，不依赖应用源码导入；现有品牌资源另提供 JPEG 标志。
- **治理与本地配置：**展示组合评估和渲染缓存决策，区分 Claude SDK 返回费用与 Codex 增量用量估算，JEV 只使用 `TYPESAFE_API_KEY`。测试使用本地样例和模拟传输，阻止调用真实外部提供方；下载的 agent 技能不纳入 Git。

### 2026-10-28

**English**

- **Human sign-in handoff:** protected local website references pause for human authentication with Sign in and Continue controls in the project. A token-protected project-scoped bridge keeps the wait alive; interrupted handoffs discard the failed browser session before another inspection. Device-authenticator network permissions are temporary, and project cancellation closes the handoff. See [application guide](docs/application-guide.md).
- **Shared browser sizing:** recording and sign-in now use one launcher for profiles, environment, window sizing and startup defaults. Visible pages follow the actual window instead of a fixed viewport, preventing clipping and blank areas after sign-in.
- **Claude login refresh:** synchronize the current login before each SDK call and pass its access token through the SDK environment. Project files and sessions stay isolated while avoiding attempts to save copied OAuth credentials into a nonexistent project Keychain. Explicit API keys and OAuth tokens retain precedence. See [project file isolation](docs/project-file-isolation.md).
- **Compact combination evaluation:** Opus includes relevant asset coverage, suitability and limitations inside each complete combination brief. JEV receives these briefs with unchanged original requirements, facts and constraints, without a separate production asset map. Cross-batch comparison still considers every surviving candidate; proposal-policy revisions invalidate older cached proposals. See [JEV strategies](src/server/jev/README.md).
- **Shared repair budgets:** bounded attempts use a common per-issue mechanism. Claude video corrections retain ten Haiku attempts with increasing effort before main-model escalation. Initial storyboard validation failures with a valid manifest now enter the same corrector for previews and full films, preserving unrelated content. See [retry budgets](docs/retry-budgets.md).
- **Playback and result controls:** refine independent narration/subtitle language controls and language-specific downloads, add consistent icon actions and generated timestamps to result cards, show job-scoped progress, and keep unavailable preview cards at the normal size. See [language-track architecture](docs/language-tracks-architecture.md).
- **Activity loading and recovery:** batch EventSource history and live updates to reduce repeated state updates and project fetches. Retry actions follow the displayed merged activity item. Renderer checks document font and clip-path constraints, with shared readiness retries across local tools and speech providers.

**简体中文**

- **人工登录交接：**受保护的本地网站参考通过项目中的“登录”和“登录后继续”控件等待人工认证。使用令牌保护、项目独立的桥接连接维持等待；交接中断后丢弃失效浏览器会话，再开始新的检查。设备认证器的网络权限仅临时授予，取消项目会关闭登录交接。详见[使用指南](docs/application-guide.md)（英文）。
- **共享浏览器尺寸逻辑：**录屏和登录共用一个启动器，统一浏览器配置、环境、窗口尺寸与启动默认值。可见页面跟随实际窗口尺寸，避免登录后固定视口造成裁切和空白。
- **Claude 登录刷新：**每次 SDK 调用前同步当前登录，并通过 SDK 环境传递访问令牌。项目文件和会话保持隔离，同时避免把复制的 OAuth 凭据写入不存在的项目钥匙串。显式配置的 API 密钥和 OAuth 令牌保持优先。详见[项目文件隔离](docs/project-file-isolation.md)（英文）。
- **精简组合评估：**Opus 在每份完整组合简报内综合相关素材覆盖、适用性及限制。JEV 接收这些简报，并保留原始需求、事实和约束，不再额外接收制作素材映射。跨批次比较仍考虑所有保留候选，提案策略版本会使旧缓存失效。详见[JEV 策略](src/server/jev/README.md)（英文）。
- **共享修正预算：**有次数上限的尝试采用统一的按问题计数机制。Claude 视频修正保留十次逐步提高推理强度的 Haiku 尝试，然后升级主模型。预览和完整影片在初始分镜验证失败、制作清单有效时，也进入同一修正器，并保留无关内容。详见[重试预算](docs/retry-budgets.md)（英文）。
- **播放与结果控件：**完善独立旁白、字幕语言选择及各语言下载，统一结果卡片的图标操作与生成日期，显示当前任务进度，并让缺失预览的卡片保持正常尺寸。详见[语言轨道架构](docs/language-tracks-architecture.md)（英文）。
- **活动加载与恢复：**批量处理 EventSource 历史和实时事件，减少重复状态更新与项目请求；重试操作跟随实际显示的合并活动项。渲染检查补充字体与裁剪路径约束，本地工具和语音提供方共用就绪检查重试机制。

### 2026-10-27

**English**

- **Independent language tracks:** configure narration voices and subtitle languages separately from visual Video language. Full builds share the same picture/music timeline, create alternate narration and SRT/VTT tracks, and expose language selectors plus MP4/audio/subtitle downloads. Existing single-language projects retain their behavior. See [video languages](docs/video-languages.md).
- **Project-local runtime files:** agent homes, temporary files, browser profiles and render caches live inside the project. Provider login credentials remain available without copying unrelated account data. Runtime files stay out of editable project exports. See [project file isolation](docs/project-file-isolation.md).
- **Local Qwen narration:** add Qwen3-TTS VoiceDesign 1.7B and Base 1.7B providers with selectable female and male voices, Chinese/English speech, shared runtime handling and bundled Base reference recordings. Existing speech providers now own their adapters and requirements in provider folders. See [speech](docs/speech.md).
- **Subtitle terminology:** rename on-screen lyrics to subtitles across settings, script items, prompts, storyboard fields and exports. Existing projects, drafts and narration profiles retain their text and settings through compatibility handling. Playback language tracks are configured separately.
- **Automatic preview planning:** one shared preview plan feeds independent direction builders. The plan retains each direction's assigned styles and scene roles; full films reuse the selected preview's production context.
- **JEV evaluation and visibility:** pass compact combination briefs instead of complete style metadata, keep cross-batch selection, and split oversized comparisons before dispatch. Governance expands selected combinations, scores and recorded calls. Future runs preserve evaluation certainty separately from Choice certainty, including compared options and probabilities.
- **JEV cost reporting:** calculate token-based estimates from recorded input usage at the published rate, including retained project history; keep SDK-reported costs when available.
- **Multiplane setup:** upgrade to 0.3.13. The installer explicitly installs its matching Chromium into Kiteva's browser cache and runs doctor; unavailable readiness results are rechecked after repair. Run `npm run multiplane:setup` to repair the installation. See [Multiplane](docs/multiplane-trial.md).
- **Activity and regression coverage:** improve preparation grouping and recovered tool activity, and add coverage for project isolation, planning, browser setup, narration providers, subtitle migration and governance.

**简体中文**

- **独立语言轨道：**旁白声音和字幕语言与画面中的 Video language 分开设置。完整构建共用同一画面和音乐时间线，生成不同语言的旁白及 SRT/VTT 字幕，并提供播放语言选择以及 MP4、音频、字幕下载。原有单语言项目保持兼容。详见[视频语言](docs/video-languages.md)（英文）。
- **项目本地运行文件：**代理主目录、临时文件、浏览器配置和渲染缓存保存在项目内。提供方登录凭据仍可使用，无需复制无关账户数据；可编辑项目导出排除运行文件。详见[项目文件隔离](docs/project-file-isolation.md)（英文）。
- **本地 Qwen 旁白：**新增 Qwen3-TTS VoiceDesign 1.7B 与 Base 1.7B 提供方，支持可选男女声、中英文语音、共享运行环境及随代码提供的 Base 参考录音。原有语音提供方的适配器和依赖文件归入各自目录。详见[语音](docs/speech.md)（英文）。
- **字幕命名：**设置、脚本条目、提示词、分镜字段和导出中的屏幕文字统一称为字幕。兼容处理保留已有项目、草稿和旁白配置的文本与设置；播放语言轨道在独立设置中配置。
- **自动预览规划：**一个共享预览计划供各方向独立构建，保留每个方向指定的风格与场景职责；完整影片复用所选预览的制作上下文。
- **JEV 评估与可见性：**传递精简组合简报，避免发送完整风格元数据；保留跨批次选择，并在请求前拆分过大的比较。Governance 可展开所选组合、分数和调用记录。后续运行分别保留评估确定度与 Choice 确定度，并记录比较选项及概率。
- **JEV 费用报告：**按已记录输入用量和公开单价计算估算费用，覆盖保留的历史项目；提供方已返回费用时优先使用该值。
- **Multiplane 安装：**升级至 0.3.13。安装脚本明确将匹配版本的 Chromium 安装到 Kiteva 浏览器缓存并运行 doctor；修复后重新检查不可用状态。可运行 `npm run multiplane:setup` 修复安装。详见[Multiplane](docs/multiplane-trial.md)（英文）。
- **活动记录与回归覆盖：**改进准备阶段分组和已恢复工具活动显示，补充项目隔离、规划、浏览器安装、旁白提供方、字幕迁移及 Governance 测试。

### 2026-10-26

**English**

- **Planning and session handoff:** one shared preview-planning call feeds independent direction builds; full films continue the selected preview's build session and plan their complete storyboard. Project settings and requirements are saved as files before planning, with concise Markdown instructions and generic system guidance. Build routes and creative approaches have separate responsibilities.
- **Shared MCP capabilities:** reference-browser tools and context-recovery registration follow the capability registry used by both providers. Narration and Audio Studio adapters use native MCP registration while retaining service-owned validation, cancellation and activity.
- **Project-wide cancellation:** stopping or deleting a project aborts queued and active SDK/MCP, browser, recording, render, audio and export work and waits for cleanup. Reported cleanup failures retain project files; other projects and shared services keep their own lifetimes. See [process lifecycle](docs/process-lifecycle.md).
- **Recording reliability:** a cancellable cross-process lock serializes native recording and saving; editing and export remain independent. OpenScreen diagnostics stay in the job workspace, queued calls have longer timeouts, and owned recorder helpers are cleaned up after failures. The lock does not guarantee FIFO ordering.
- **Clearer activity:** repeated narration and render retries update the latest result, recovered narration clears earlier failure status, and rendering uses recorded outcomes instead of leaving failed attempts as unfinished progress bars.
- **Provider cost reporting:** Claude uses SDK-reported costs. Codex uses standard API estimates based on incremental thread usage, separating cache reads/writes and counting reasoning once. Real SDK calls verified cumulative resume behavior for both providers. See [cost reporting](docs/costs.md).
- **Dependencies and regression coverage:** OpenAI and Anthropic SDK packages track `latest`; other dependencies use explicit versions, with grouped Dependabot updates. Added coverage for planning handoffs, shared preview correction paths, process ownership, recording concurrency and resumed-session costs.

**简体中文**

- **规划与会话交接：**一次共享预览规划供各方向独立构建；完整视频延续所选预览的构建会话，并规划完整分镜。规划前将项目设置和需求保存到文件，使用简洁的 Markdown 指令和通用系统指导。构建路线与创意方式各自承担独立职责。
- **共享 MCP 能力：**参考浏览器工具与上下文恢复注册纳入两家提供方共用的能力注册表。旁白和 Audio Studio 适配器使用原生 MCP 注册，同时保留服务自身的验证、取消与活动记录。
- **项目级联取消：**停止或删除项目会取消排队和执行中的 SDK/MCP、浏览器、录屏、渲染、音频及导出任务，并等待清理完成。报告依赖清理失败时保留项目文件，其他项目和共享服务保持各自生命周期。详见[进程生命周期](docs/process-lifecycle.md)。
- **录屏可靠性：**可取消的跨进程锁串行处理原生录制和保存，编辑与导出仍可独立继续。OpenScreen 诊断保留在任务目录中，排队调用采用更长超时，失败后清理所属录屏辅助进程。该锁不保证先进先出顺序。
- **更清晰的活动记录：**重复旁白调用和渲染重试显示最新结果，旁白重试成功后清除之前的失败状态；渲染使用已记录的执行结果，避免失败尝试一直显示为未完成的进度条。
- **提供方费用报告：**Claude 使用 SDK 返回的费用；Codex 根据线程新增用量按标准 API 单价估算，分开计算缓存读取与写入，推理令牌只计一次。已通过两家提供方的真实 SDK 调用验证续接会话的累计计数行为。详见[费用报告](docs/costs.md)。
- **依赖与回归覆盖：**OpenAI 和 Anthropic SDK 包跟随 `latest`，其余依赖使用明确版本，并由 Dependabot 分组更新。新增规划交接、共享预览修正、进程归属、录屏并发及续接会话费用的测试覆盖。

### 2026-10-25

**English**

- **v0.4.0:** project-local MCP technology tools, AnySearch research, narration tools, shared corrections and the Pixel RPG Quest Explainer. See the [release notes](CHANGELOG.md#040--2026-10-25).

- **Project-local technology tools:** both providers inspect availability through Creative Pool MCP, choose their own tools and run JavaScript, Python or other setup inside the project. Browser preparation bundles libraries, stylesheets and assets without installing packages or relying on Kiteva's dependency tree.
- **Documentation research:** the bundled AnySearch skill reads tool documentation, CLI parameters, repository examples and source code. Native provider web search/fetch is disabled; sandbox networking supports research and model-owned setup, with project-local caches and isolated Codex skill discovery.
- **Clearer provider activity:** reads, file updates, checks, installation and bundling share labels across GPT and Claude. Failed MCP calls and commands stay failed; equivalent workflow stages no longer disappear into generic build messages.
- **Offset-print lyric graphics:** Printed Spark Collage and Boxed-Word Active Relay bring the catalog to 142 Motion Graphics and 50 motions, with Opus-authored previews and recorded exact-template inputs. Per-Motion-Graphic technology reviews exclude project composition/export pipelines.
- **Pixel RPG Quest Explainer:** a reviewed Motion Graphic and preview plus Step-Tick Slot Refill. Pixel progress follows the explained concepts rather than decorative counters.
- **Prompt and preview fixes:** document filenames and titles stay out of the finished video unless requested; unanswered questions pause before storyboard validation, mention previews keep stable dimensions, and new catalog details have Chinese translations.
- **Architecture documentation:** updated capability ownership, technology setup and skill-staging diagrams. Full local verification: 1,843 tests passed, three skipped, with build, lint and formatting passing. Platform-specific release verification is reported separately.

**简体中文**

- **v0.4.0：**新增项目独立的 MCP 技术工具、AnySearch 研究、旁白工具、共享修正机制与 Pixel RPG Quest Explainer。详见[发布说明](CHANGELOG.md#040--2026-10-25)。

- **项目独立的技术工具：**两种提供方均通过 Creative Pool MCP 按需检查可用性，由模型选择工具，并在项目内完成 JavaScript、Python 或其他环境的安装配置。浏览器准备工具只打包库、样式和资源，不安装依赖，也不依赖 Kiteva 自身的依赖树。
- **工具文档研究：**内置 AnySearch 技能用于阅读工具文档、命令行参数、仓库示例与源码。关闭提供方原生网页搜索和抓取；沙箱网络支持研究及模型自主安装，缓存保留在项目内，Codex 的技能发现使用独立目录。
- **一致的提供方活动日志：**GPT 与 Claude 的读取、文件更新、代码检查、安装和打包使用共享标签。失败的 MCP 调用和命令保持失败状态，相同工作阶段不再被通用构建消息掩盖。
- **套印歌词图形：**新增 Printed Spark Collage 与 Boxed-Word Active Relay，目录现有 142 种动态图形和 50 种动效；预览由 Opus 编写，并记录与正式模板一致的输入。单个 MG 的技术审阅不再包含项目级合成与导出框架。
- **Pixel RPG Quest Explainer：**新增经审阅的动态图形与预览，以及 Step-Tick Slot Refill 动效。像素进度跟随概念讲解，不使用纯装饰性计数。
- **提示词与预览修复：**除非用户明确要求，成片不显示或朗读文档文件名和标题；未回答的问题在分镜验证前暂停，提及预览保持稳定尺寸，新增目录详情补齐中文翻译。
- **架构文档：**更新能力归属、技术环境准备与技能分发图。本地完整验证为 1,843 项测试通过、三项跳过，构建、lint 与格式检查均通过；发布所需的平台专项验证另行报告。

### 2026-10-24

**English**

- **Narration as an internal tool:** models create and edit timed narration through MCP; the application retains measured speech scheduling, mixing and validation. Narration activity appears for actual narration-tool calls.
- **Corrections preserve accepted work:** shared manifest merging retains omitted fields across generation and correction paths, protecting shot lists, soundtrack references and unrelated settings.
- **Production controls:** event-based activity groups show the latest repeated action, timing retries stay grouped by cycle, capture timing recovery preserves accepted footage, and customer questions use plain language about the result.
- **Usage and prompt settings:** Governance separates ordinary input, cache reads, cache writes and output, with API-rate estimates and explicit uncertainty. Claude prompt caches use a five-minute TTL. Shared color chips work in prompt displays and editors; selected Motion Graphic contributions are guided by the idea rather than selection order.

**简体中文**

- **旁白作为内部工具：**模型通过 MCP 创建和编辑定时旁白；应用继续负责实测语音调度、混音与验证。只有实际调用旁白工具才显示旁白活动。
- **修正保留已接受内容：**生成与修正路径使用共享清单合并机制，保留未返回字段，保护镜头列表、配乐引用和无关设置。
- **制作流程控制：**按事件分组的活动日志显示重复操作的最新结果，时间修正按重试周期分组；录制时间恢复保留已接受素材，面向用户的问题使用描述结果的日常语言。
- **用量与提示词设置：**Governance 分别记录普通输入、缓存读取、缓存写入和输出，以 API 价格估算费用并明确不确定范围。Claude 提示词缓存采用五分钟有效期。共享颜色标签用于提示词展示与编辑；所选动态图形的贡献由创意指导，不再取决于选择顺序。

### 2026-10-23

**English**

- **v0.3.0:** chapter-based demos, timed narration, native cursor action logs, renderer reuse and grouped activity. See the [release notes](CHANGELOG.md#030--2026-10-23).

- **Chapter-based application demos:** the main model saves a validated storyboard before recording. Fresh chapter sessions capture the planned interactions, and narration and assembly use the accepted footage and measured durations.

- **Chapter timing recovery:** native OpenScreen speed regions fit complete action sequences to chapter budgets. Timing conflicts allow up to ten local retries while retaining accepted chapters and the approved film plan.

- **Native cursor action logs:** browser actions supply timestamped events directly to OpenScreen’s `setPointerTrack` after recording stops. Fullscreen capture keeps page and window coordinates aligned without toolbar-offset calculations; OpenScreen renders the cursor and click effects.

- **Timed narration:** script items have separate time windows, text or generation instructions, caption visibility and voice settings. Local Pocket TTS uses a persistent worker for repeated speech requests.

- **Native Claude planning:** planning uses the SDK’s plan mode with an automatic handoff; structured validation and stage-specific tool controls remain in place before implementation.

- **Chapter activity:** capture work is grouped under its chapter, with timing validation, retry counts and accepted export durations shown in the activity log.

**简体中文**

- **v0.3.0：**新增按章节录制演示、定时旁白、原生指针操作日志、渲染复用与分组活动日志。详见[发布说明](CHANGELOG.md#030--2026-10-23)。

- **按章节录制应用演示：**主模型先保存验证通过的分镜，再由各章节的独立会话录制计划中的交互；旁白与合成使用已接受的实录素材和实测时长。

- **章节时长修复：**通过 OpenScreen 原生速度区域，将完整操作序列控制在章节预算内。时长冲突最多进行十次章节内重试，同时保留已接受章节与原有成片计划。

- **原生指针操作日志：**录制结束后，将浏览器操作产生的带时间戳事件直接传给 OpenScreen 的 `setPointerTrack`。全屏录制使页面与窗口坐标一致，无需计算工具栏偏移；指针与点击效果由 OpenScreen 渲染。

- **定时旁白：**每个脚本项可分别设置时间窗口、文本或生成要求、字幕显示和声音。本地 Pocket TTS 使用常驻工作进程处理重复语音请求。

- **Claude 原生规划：**规划使用 SDK 的计划模式并自动交接；实施前仍保留结构化验证与按阶段限制的工具权限。

- **章节活动日志：**录制工作归入对应章节，并显示时长验证、重试次数与已接受导出的实测时长。

### 2026-10-22

**English**

- **Fine-tune checkpoints:** revisions resume the completed video session with verified source-artifact context, retained authoring selections and inherited renderer-owned cache; conservative hash and byte validation still controls reuse.

- **Capture cursor size:** new OpenScreen takes use a fixed cursor size of 1.5; historical recordings retain their saved sizes.

- **Vintage Rubber Hose metadata:** the existing preview defines visual identity and motion, including mandatory environmental acting wherever scenery is present; project subjects stay flexible and colour overrides stay scoped to their scenes.

- **Motion clip mentions:** the shared `@` picker, chips and hover previews now support motion clips alongside Motion Graphics; references retain explicit XML IDs for Creative Pool lookup.

- **Explicit visual stages:** a shared, renderer-independent authoring helper separates calculate, decide, apply and commit; each renderer supplies its own calculation and application behaviour. Reuse is disabled by default; any input revision or visual-state change rebuilds the owned part. Browser tests cover backward and fresh direct seeking.

- **Multiplane reuse trial:** provider-owned validated shot caching with conservative project-wide invalidation, checksum checks and an isolated real-render verification script.

- **Clear attachment states:** material steps distinguish attached files from the asset pool with explicit labels, visible Add actions and green Attached badges.

- **Narration start time:** set an explicit opening silence in Speech settings; synthesized audio and caption cues share the offset, and older workers are blocked from silently dropping it.

- **Grouped rendering progress:** repeated code-driven shot checks and frame logs share one Ant Design X activity group with a measured progress bar; HyperFrames, Multiplane and the Remotion fallback share the same progress display, and viewing-copy exports also show their percentage. Completed measured operations show a green success icon at 100%, preserving failed/stopped states. Progress bars sit inline to the right of each parent label, followed by the percentage. Parent work nodes relay their current measured stage and omit duplicate rendering child rows. Each renderer owns its progress adapter; shared code only dispatches normalized progress to the common display.

- **Lean Creative Pool responses:** omit source-review and provenance metadata; fixed-style previews and selected-direction planning, builds and repairs hide variants and suggested combinations through a shared MCP flag. Automatic style exploration retains those alternatives.

- **README badges:** added releaseszn, latest release, MIT license and Native Windows CI badges beneath the logo.

- **Governance authoring details:** visual and audio Jev choices share one details display, including selected resources and expandable probabilities for saved projects.

- **v0.2.0:** release with 140 Motion Graphics and 48 motions, style-driven previews, shared planning, editable project exports, native capture and the MIT license. See the [release notes](CHANGELOG.md#020--2026-10-22).

- **MIT license:** switched to standard MIT, removed the top license reminder and simplified the license section.

- **Shared renderer policy:** each renderer owns its CLI flags, preview/full stages, output settings and audio guidance in `src/server/rendering/<renderer>/metadata.ts`. Execution, prompts and reproduction instructions consume those definitions; renderer authoring contracts live alongside them. A regression test verifies that changing one policy flag reaches all consumers.

- **Multiplane full-film lint bypass:** full-film inspect, verify and render commands now also hardcode `--no-lint`, with the same requirement in the model prompt and reproduction instructions. Runtime determinism verification and full-film QA remain enabled.

- **Multiplane preview lint bypass:** the preview route prompt explicitly requires `multiplane render --no-lint`, and the application always passes that flag for preview exports. This also skips the renderer’s built-in lint of bundled libraries such as GSAP; full films also skip lint as described above.

- **Previews skip QA:** all preview routes plan, build and render without design/playback QA, finished-result review or automatic repair loops. Basic file/output checks remain; full films keep QA and repairs.

- **Visual authoring details in Governance:** each JEV authoring-selection row shows the selected resource and probability for its preview/full-film job. Expand the row to inspect all compared resources and their probabilities; missing historical choices remain unreported rather than inferred.

- **Style mentions throughout prompt displays:** Assistant replies, project conversations and board summaries, and Governance prompt views render explicit style references as the same `@` chips used by the editor. Hover or keyboard focus opens the same animated `StylePickerPreview` component used in Settings, sharing the application's already-loaded preview metadata. Stored prompts and model-facing XML remain unchanged.

**简体中文**

- **微调检查点：**修订延续已完成视频的模型会话，携带经过文件核验的上下文、原有创作资源选择及渲染器所属缓存；复用仍受保守哈希与字节校验控制。

- **录屏指针大小：**新 OpenScreen 录制的指针大小固定为 1.5；历史录制保留原有大小。

- **复古橡皮管元数据：**以现有预览为视觉风格和动作依据，有场景时必须进行环境表演；项目题材保持灵活，改色要求仅限其指定场景。

- **动作片段引用：**共享的 `@` 选择器、标签和悬停预览现可同时引用动作片段与动态图形，并以明确的 XML ID 供 Creative Pool 查询。

- **明确的画面更新阶段：**渲染器无关的共享编写辅助函数区分计算、判断、应用和提交，各渲染器提供自己的计算与应用行为；默认关闭复用，输入版本或画面状态变化时重建所属部分，并用浏览器测试验证倒放跳转与首次直接定位。

- **Multiplane 复用试验：**由渲染器负责缓存已验证的镜头，保守地按整个项目输入使缓存失效，并提供校验和检查与独立真实渲染验证脚本。

- **清晰的附件状态：**素材步骤明确区分已附加文件与素材池，显示添加操作和绿色已附加标记。

- **旁白开始时间：**可在语音设置中明确设置片头留白，合成音频和字幕时间同步延后；阻止旧工作进程静默忽略该设置。

- **合并渲染进度：**重复的镜头检查和帧日志合并为一个 Ant Design X 活动组，显示基于实际进度的进度条；HyperFrames、Multiplane 和 Remotion 回退共用同一进度展示，播放副本导出也显示百分比。实测操作达到 100% 时显示绿色完成图标，保留失败和停止状态。进度条在父级标题右侧同行显示，百分比紧随其后。父级工作节点同步当前阶段的实测进度，并移除重复的渲染子行。各渲染器分别维护自己的进度适配器，共享代码仅分派标准化进度并统一展示。

- **精简 Creative Pool 响应：**移除来源审阅和溯源元数据；固定风格预览及已选方向的规划、制作与修复通过共享 MCP 标志隐藏变体和建议组合，自动风格探索仍保留这些备选信息。

- **README 徽章：**在标志下方添加 releaseszn、最新版本、MIT 许可和 Native Windows CI 徽章。

- **Governance 创作详情：**视觉和音频 Jev 选择共用详情展示，显示已保存项目的所选资源及可展开的概率比较。

- **v0.2.0：**包含 140 种 Motion Graphic、48 种动作、指定风格预览、共享规划、可编辑项目导出、原生录屏与 MIT 许可。详见[发布说明](CHANGELOG.md#020--2026-10-22)。

- **MIT 许可：**改用标准 MIT 许可，移除顶部许可提醒，并简化许可章节。

- **统一渲染器策略：**每个渲染器在 `src/server/rendering/<renderer>/metadata.ts` 集中定义 CLI 参数、预览/完整视频步骤、输出设置及音频规则，执行命令、提示词和复现说明共同读取；创作契约放在对应渲染器目录。回归测试验证一处参数修改会传递到全部使用方。

- **Multiplane 完整视频跳过内置 lint：**完整视频的 inspect、verify、render 命令均固定传入 `--no-lint`，模型提示词及复现说明同步要求此参数；运行时确定性验证及完整视频 QA 继续执行。

- **Multiplane 预览跳过内置 lint：**预览路线提示词明确要求 `multiplane render --no-lint`，应用导出预览时固定传入该参数，避免渲染器内置 lint 因 GSAP 等依赖而阻止导出；完整视频也按上述说明跳过 lint。

- **预览跳过 QA：**所有预览路线先规划、再制作并直接渲染，不运行设计/播放 QA、成片评审或自动修复循环。保留基本文件和输出检查；完整视频继续执行 QA 和修复。

- **Governance 视觉创作选择详情：**JEV 创作资源选择行显示对应预览或完整视频所选资源及概率。展开可查看全部比较选项及概率；历史记录缺少的选择不会被推测补全。

- **提示词统一显示风格引用：**Assistant 回复、项目对话和看板摘要，以及 Governance 提示词视图，使用与编辑器相同的 `@` 标签显示明确的风格引用。鼠标悬停或键盘聚焦时，复用 Settings 中的同一个动态 `StylePickerPreview` 组件及应用已加载的预览元数据；保存的提示词及发给模型的 XML 保持不变。

### 2026-10-21

**English**

- **Plan validation recovery:** rejected video plans retain their response and SDK session so the same main model can correct exact layer-reference and timing errors before building (up to three total plan attempts). Cancellation and unrelated provider failures do not trigger correction. Activity distinguishes receiving a plan from validation and successful saving.

- **Workflow diagrams:** document the [three video generation routes](docs/architecture.md#video-generation-routes), [prompt routes A–D](docs/architecture.md#prompt-routes) and [subworkflow calls and checkpoints](src/server/jobs/subworkflows/README.md#subworkflow-diagrams). Include shared planning, preview session continuation, audio behavior and the extra concept-planning call still present in selected-style previews.

- **Shared main-model planning:** automatic-style previews, selected-style previews and direct full builds use the same validated plan-before-build step. Opus previews now plan in native Claude plan mode, with implementation continuing in the returned session; planning no longer depends on a model allowlist. Focused refinements keep their existing repair flow.

- **Route-aware preparation activity:** selected-style routes display Project title and Preview planning rather than full Brief / Direction selection. Title-only and preview-planning calls have distinct activity labels, including historical title-only runs. Finished or interrupted projects stop unfinished preparation indicators without marking them successful.

- **Full-width mention results:** style preview rows fill the `@` dropdown width, with IDs aligned to the trailing edge.

- **One wizard action:** removed the redundant send arrow from onboarding replies; Continue remains the visible way to advance each step.

- **Shared style-search previews:** the `@` suggestion list reuses the Settings picker’s existing `StylePickerPreview` row component and thumbnail source instead of rendering a separate text-only style list.

- **Top-edge editor resize:** the idea reply box uses an Ant Design vertical Splitter; drag its top divider upward to expand the editor or downward to shrink it while keeping controls visible.

- **Frontend rebuild recovery:** serve new frontend assets dynamically after a rebuild instead of retaining a startup filename snapshot. Missing asset requests return 404 rather than the HTML app shell, preventing blank pages from misleading 200 responses.

- **Inline style mentions:** Type `@` in the idea editor to search Motion Graphics by name or ID with Ant Design X Suggestion. Sender renders the selected entry as an inline tag; the saved idea carries `<style id="style-140">Vintage Rubber Hose Animation</style>`. Both providers read embedded IDs through the creative-pool MCP. Mentions preserve local act/scene scope and do not change Settings selections.

- Preserve “Skip previews” when restoring a draft with Settings-selected styles; submission keeps the exact selected IDs and original idea.

- **Style lookup through MCP:** Authoring handoffs pass selected Motion Graphic IDs and roles; shared system guidance requires reading full canonical definitions by ID through `creative_pool.read_pool_entry` before planning or building. Names in the original idea are resolved through MCP search, without host-side extraction.

- **Explicit-style previews:** styles selected in Settings can produce the requested preview directions without JEV style-combination proposals or ranking. Preview count is independent of style selection; zero directions keeps direct build. Saved settings, regeneration and act/scene style assignments are preserved. The original act/scene style rule is shared by preview and full-build prompts. Removed prompt-name matching: only Settings selections enter routing and count limits; the original idea goes unchanged to the model.

- **Vintage Rubber Hose Animation:** a new Motion Graphic for early hand-inked cartoon drawing: strong irregular ink silhouettes, painterly shadow masses, expressive warped scenery and elastic, stepped acting at 12 drawings a second, adapted to the project's output settings. Any original subject works, with or without characters; the project's colours, story, renderer and audio settings stay in charge. Its only optional effects are film wear and a precise vintage film-leader countdown. The rendered preview is a Claude-authored sample, a crooked house at night followed by a 3-2-1 leader. The collection now has **140 Motion Graphics**.
- **Capture lifecycle:** remove local and remote browser-call, native-edit, screenshot, take-count, recording-duration and output-size budgets. Recordings stop explicitly or on cancellation.
- **Camera planning:** the main model explores the live application before choosing component focus, zoom amount and timing. Automatic zoom generation stays disabled, cursor smoothing is 0.15, and exports preserve reviewed zooms and wide intervals.
- **Browser capability coverage:** unify tool names, schemas and handlers; add file uploads and browser session, pointer, frame, dialog, network, diagnostics and capture operations. Local mock workflows use normal HTTP(S) requests; hosted access retains its proxy boundary.
- **Multiplane shots:** inspect, verify and render independently loaded shots, then join their visual output and apply the full-film soundtrack once to avoid film-wide frame preloads.
- **Activity display:** consolidate recovered tool retries, order updates chronologically, preserve spacing without timestamps and follow appended activity.
- **Editable project downloads:** expose available sources and media even from failed builds, with an OTIO timeline, SRT subtitles, audio files and streaming ZIP delivery. See the [export guide](docs/editable-projects.md).

video planning, native capture and JEV selection.

- **JEV selection:** retain the original idea and section instructions; compare visual authoring options using textual advantages, disadvantages and constraints. Style combinations are evaluated in batches, then JEV Choice compares all survivors repeatedly until the requested number of directions is selected. Preliminary scores no longer determine the final order.
- **Audio authoring:** add [Audio Studio MCP](https://github.com/kanaworksai-hue/audio-studio-mcp) as a local capability, with independent JEV selection and renderer-owned audio contracts. Multiplane receives prepared audio assets before rendering; uploaded audio retains its own usage guidance.
- **Planning and preparation:** separate full-brief and title-only workflows. Direct builds preserve the original idea and still receive a project title. Full videos use a main-model planning turn (Claude's native plan mode for Claude) and a prose plan before capture and implementation; renderer-specific demo routes preserve feature coverage, section titles and act-specific Motion Graphics.
- **Native OpenScreen editing:** use the referenced upstream demo skill and document-scoped MCP tools for review, trims, speed regions, zooms and export. Remove custom idle-gap editing, automatic input scrolling/centering and the fixed 450 ms pause. Keep the captured frame fitted within the final composition.
- **Assistant and activity:** add website references one URL per item, share the narration/subtitles script, apply each setting's source guidance through shared logic, pause generation for blocking questions and surface them in the Assistant. Activity follows appended logs and replaces recovered failures with the latest status without retry subtrees.
- **Setup and organization:** add `install.sh` and an OpenScreen setup helper, simplify `.env.example`, update Claude Agent SDK through `latest`, and group capabilities, renderer metadata and JEV strategies in their own folders. React Bits discovery accepts current JS/TS-only registry entries.

**简体中文**

- **计划验证修复：**视频计划被拒绝时保留原始响应与 SDK 会话，由同一主模型针对图层引用和时间错误修正，再验证后制作（最多三次计划尝试）。取消和无关的提供商错误不会触发修正。活动日志区分接收计划与验证通过并保存。

- **工作流图：**说明[三种视频生成路线](docs/architecture.md#video-generation-routes)、[提示词路线 A–D](docs/architecture.md#prompt-routes)以及[子工作流调用和检查点](src/server/jobs/subworkflows/README.md#subworkflow-diagrams)。包含共享规划、预览会话延续、音频行为，并标明已选风格预览中仍存在的额外创意规划调用。

- **共享主模型规划步骤：**自动风格预览、已选风格预览和直接完整制作均复用先验证计划再实施的步骤。Opus 预览现在使用 Claude 原生规划模式，实施继续使用规划返回的同一会话；不再通过模型白名单决定是否规划。定向微调保留原有修复流程。

- **按实际路线显示准备进度：**已选风格路线显示“项目标题”和“预览规划”，不再误显示为完整简报或方向选择。标题提取和预览规划使用独立活动标签，历史仅标题运行也能正确显示。项目结束或中断后，未完成的准备步骤停止转圈，也不会被误标为成功。

- **全宽引用搜索结果：**风格预览行铺满 `@` 下拉列表，ID 对齐到行末。

- **统一向导操作：**移除引导回复框中重复的发送箭头，保留“继续”作为前往下一步的可见操作。

- **复用风格搜索预览：**`@` 建议列表直接复用设置选择器已有的 `StylePickerPreview` 行组件及缩略图来源，不再单独显示仅文字的风格列表。

- **从顶部调整编辑器高度：**创意回复框使用 Ant Design 纵向 Splitter；向上拖动顶部边界可展开编辑器，向下拖动可缩小，并保持操作按钮可见。

- **前端重建恢复：**重建后动态提供新的前端资源，不再保留启动时的文件名快照。缺失资源返回 404，而不是 HTML 应用页面，避免出现返回 200 却显示空白的情况。

- **行内风格引用：**在创意编辑器中输入 `@`，通过 Ant Design X Suggestion 按名称或 ID 搜索 Motion Graphic。Sender 将所选条目显示为行内标签；保存的想法使用 `<style id="style-140">Vintage Rubber Hose Animation</style>`。两个提供方均通过 creative-pool MCP 读取引用 ID，保留对应幕或场景的范围，不改变设置中的选择。

- 恢复已在设置中选择风格的草稿时保留“跳过预览”；提交时保持已选 ID 和原始想法不变。

- **通过 MCP 读取风格：**创作交接只传递已选 Motion Graphic 的 ID 和角色；共享系统指引要求在规划或构建前通过 `creative_pool.read_pool_entry` 按 ID 读取完整定义。原始想法中的名称由模型通过 MCP 搜索解析，不在宿主代码中提取。

- **指定风格预览：**在设置中选择的风格，可直接生成指定数量的预览方向，跳过 JEV 风格组合提案与排名。预览数量与风格选择独立，零个方向仍直接构建完整作品；保留已保存设置、重新生成及幕/场景的风格分配。 预览与完整构建共用原有的幕/场景风格范围指引。 移除创意文本中的名称匹配：只有设置中选择的风格参与路由和数量限制，原始创意完整交给模型理解。

- **复古橡皮管动画（Vintage Rubber Hose Animation）：**新增一种早期手工上墨卡通风格的 Motion Graphic：强烈而不规则的墨色剪影、绘画感阴影色块、富有表现力的扭曲场景，以及每秒 12 张画稿的弹性步进表演，并适配项目的输出设置。可使用任何原创主体，有无角色均可；项目的配色、故事、渲染器和音频设置始终优先。仅有的可选效果是胶片磨损和精确的复古胶片片头倒计时。已渲染的预览是 Claude 编写的示例：一座夜晚的歪斜房屋，随后是 3-2-1 片头。现在共 **140 种 Motion Graphic**。
- **录屏生命周期：**移除本地与远程录屏的浏览调用、原生编辑、截图、录制次数、录制时长及输出大小预算；录制由显式停止或项目取消结束。
- **镜头规划：**主模型先探索真实应用，再决定组件焦点、缩放幅度和时间。关闭自动缩放生成，光标平滑固定为 0.15，导出保留审阅后的缩放区间和全景区间。
- **浏览器能力覆盖：**统一工具名称、参数模式及处理程序；补齐文件上传、浏览器会话、指针、框架、对话框、网络、诊断和捕获操作。本地原型使用正常 HTTP(S) 请求；托管模式保留代理边界。
- **Multiplane 分镜加载：**分别加载、检查、验证及渲染各个短镜头，拼接画面后统一加入全片音乐，避免一次预载整部影片的帧。
- **Activity 显示：**合并恢复成功的工具重试，按时间顺序排列，无时间戳时保留一致间距，并跟随新增日志。
- **可编辑项目下载：**失败构建也能导出已有源文件和媒体，包含 OTIO 时间线、SRT 歌词及音频文件，使用流式 ZIP 下载。参见[导出指南](docs/editable-projects.md)（英文）。

视频规划、原生录制及 JEV 选择。

- **JEV 选择：**保留完整原始想法和各设置说明，使用文字描述视觉创作选项的优势、劣势与限制。风格组合先分批评估，再由 JEV Choice 对所有通过检查的方向反复比较，直到选出要求数量的方向；初步分数不再决定最终顺序。
- **音频创作：**接入本地 [Audio Studio MCP](https://github.com/kanaworksai-hue/audio-studio-mcp) 能力，通过独立的 JEV 策略选择，并由各渲染器维护音频能力和接入约定。Multiplane 在渲染前接收已准备的音频素材；上传音频仍使用自身的素材指引。
- **规划与准备：**分开完整简报和仅提取标题的工作流。直接制作保留原始想法并生成项目标题。完整视频由主模型先生成文字计划（Claude 使用原生规划模式），再录制和实施；按渲染器区分演示路线，保留主要功能覆盖、章节标题及各幕指定的 Motion Graphic。
- **OpenScreen 原生编辑：**引用上游演示技能，通过仅作用于当前文档的 MCP 工具审阅、裁剪、变速、缩放和导出。移除自定义空闲间隙编辑、输入框自动滚动/居中和固定 450 毫秒停顿，并要求录屏完整适配最终画面。
- **助手与 Activity：**网站链接改为一项一个 URL，旁白和屏幕歌词共用脚本，通过共享逻辑应用各设置自己的素材指引。遇到阻塞问题时暂停生成并在助手中显示。Activity 跟随新增日志滚动，恢复成功后以最新状态替换失败状态，不再显示重试子树。
- **安装与目录：**新增 `install.sh` 和 OpenScreen 安装辅助脚本，精简 `.env.example`，通过 `latest` 更新 Claude Agent SDK，并分别组织能力、渲染器元数据及 JEV 策略。React Bits 检索支持当前仅带 JS/TS 后缀的条目。

### 2026-10-20

**English**

agent planning, capabilities and demo capture.

- Added **Animate UI** component discovery for both providers and shared **JEV 1.14.0 Choice** selection of one primary authoring capability, bundled skill or local-code approach. Internal creative-pool tools expose complete Motion Graphic, motion and technology definitions; the main model retains production planning.
- Split workflow guidance into application-demo, static-screen, concept-film and mixed-film route prompts. Mixed films apply the appropriate route to each section while preserving act boundaries, selected styles and required feature coverage; detailed timings are planned from the actual content and reference evidence.
- Simplified preparation output so the application preserves original request data and settings. Guarded brief corrections report the exact rejected edit and retry against the unchanged valid draft.
- Refined **OpenScreen capture**: a **450 ms** pause after pointer arrival, smooth input centering, native zoom framing that includes the full active field and label, and removal of automatic network-idle holds after each action. Auto-zoom remains enabled; other cursor controls retain native defaults unless supplied. Generation and review guidance also address clipped footage and decorative patterns obscuring text.
- Added **Particle Flow Network**, bringing the collection to **139 Motion Graphics and 48 motions**, and rebuilt its preview and **Manga Production Theatre** with consistent role-specific crew. Removed the structured-score/MIDI/FluidSynth requirement; the main model composes instrumental music with the available local tools.

**简体中文**

改进代理规划、能力和演示录制。

- 为两种提供商加入 **Animate UI** 组件检索，并通过共享的 **JEV 1.14.0 Choice** 选择一个主要创作能力、内置技能或本地代码方案。内部创意池工具提供完整的 Motion Graphic、motion 和技术定义；制作规划仍由主模型负责。
- 将工作流指引拆分为应用演示、静态截图展示、概念短片和混合影片四种路线提示。混合影片按章节采用对应路线，保留幕次边界、所选风格和要求覆盖的功能；具体时间安排根据实际内容与参考证据在规划时生成。
- 精简准备阶段的输出，由应用保留原始请求和设置。受保护的简报修正会反馈具体被拒绝的编辑，并基于未改变的有效简报重试。
- 改进 **OpenScreen 录制**：指针到达后停顿 **450 毫秒**，平滑滚动并居中输入框，使用原生缩放保留完整输入框和标签，并移除每次操作后的自动网络空闲等待。自动缩放保持开启；其他光标参数未指定时沿用原生默认值。生成与审阅指引也覆盖录屏裁切及装饰纹理遮挡文字的问题。
- 新增 **Particle Flow Network**，目录达到 **139 种 Motion Graphic、48 种 motion**；重建其预览及 **Manga Production Theatre** 预览，保持各角色人员造型和道具一致。移除结构化乐谱/MIDI/FluidSynth 的强制流程，由主模型使用可用本地工具创作器乐配乐。

### 2026-10-19

**English**

- **English / 中文 interface switching**, translated catalog and Governance views, clearer activity grouping, and improvements to project, retry and video workflows. Interface language remains separate from generated-video language.
- Added local **OpenScreen recording with an optional desktop worker**, cursor and zoom presentation controls, and smoother recorded browser interactions. Local recording uses a dedicated visible browser window.
- Updated the agent SDK dependencies and added tool-call execution checks that disallow Blender, guarded leaf-level brief corrections, **uniform random creative directions**, a one-hour render timeout and SQLite lock-contention handling.

**简体中文**

- 新增 **English / 中文界面切换**，翻译目录及 Governance 页面，改进 Activity 分组，以及项目、重试和视频工作流。界面语言仍与生成视频的语言独立。
- 加入本机 **OpenScreen 录制及可选独立桌面工作节点**、光标与缩放展示参数，并优化录制时的浏览器交互。本机录制使用独立可见的浏览器窗口。
- 更新 agent SDK 依赖，加入禁止 Blender 的工具调用执行检查、受保护的简报叶子字段修正、**均匀随机创意方向**、一小时渲染超时及 SQLite 锁竞争处理。

### 2026-10-18

**English**

- **v0.1.0 — first source release.** See the [release notes](CHANGELOG.md#010--2026-10-18). Includes 138 Motion Graphics, 48 motions, both agent providers, headless website capture and English / Chinese delivery. Native Windows sandbox and render verification passed in CI; Windows support remains experimental.

- Added **English / 简体中文 video language**, translated narration and subtitles with preserved originals, and a separate Chinese Pocket TTS provider. Music and Narration / subtitles now have separate Assistant steps.
- Added **Cassette Futurism**: hardware panels, phosphor screens, tape reels and stepped animation, with a rendered preview. The collection now has **137 Motion Graphics**.
- Added **Terminal Lyric Duotone Anime**: flat blue, cream and black anime art in a CRT terminal frame, with bilingual decoding captions and ringed keyword titles, plus a code-drawn illustrative preview. Also added two motions, **Rotating Sonar-Sweep Reveal** and **Pixel-Tile Materialize & Targeted Delete**. The collection now has **138 Motion Graphics and 48 motions**.
- Added an **experimental native Windows backend**, platform-aware setup and a render verification command. Actual Windows 10/11 testing is still pending; project creation on Windows requires a successful verification first. See the [Windows setup guide](docs/windows.md).

- Published English and Chinese READMEs, a Kiteva-made introduction film, desktop and Storyboard screenshots, architecture diagrams, and technology and cost documentation.
- Added contribution guidance and the [project license](LICENSE).

**简体中文**

- **v0.1.0 — 首个源码版本。** 见[发布说明](CHANGELOG.md#010--2026-10-18)。包含 138 种 Motion Graphic、48 种 motion、两种 agent 提供商、无头网站录制及中英文输出。原生 Windows 沙箱与渲染验证已通过 CI；Windows 支持仍为实验性。

- 新增 **English / 简体中文视频语言**，支持翻译旁白和歌词并保留原文，接入独立的中文 Pocket TTS 后端；助手中的 Music 与 Narration / subtitles 分开设置。
- Anatomy 改为启动时安装或更新，离线时保留已校验版本，不再在源码中打包上游文件。
- 新增 **Cassette Futurism（卡带未来主义）**：硬件面板、荧光屏幕、磁带和步进动效，附已渲染的演示预览。现在共 **137 种 Motion Graphic**。
- 新增 **Terminal Lyric Duotone Anime（终端歌词三色墨动画）**：蓝、奶油、黑三色平涂动漫画面配 CRT 终端画框，带双语解码字幕和环形关键词标题，附代码绘制的示意预览。同时新增两种 motion：**旋转声呐扫描显影**和**像素瓦片显形与定点删除**。现在共 **138 种 Motion Graphic、48 种 motion**。
- 新增**实验性的原生 Windows 后端**、适配平台的安装流程和渲染验证命令。实际 Windows 10/11 测试仍待完成；Windows 上须先通过验证，才能创建项目。见 [Windows 安装指南](docs/windows.md)。

- 发布中英文 README、由 Kiteva 自己制作的介绍短片、桌面与 Storyboard 截图、架构图，以及技术清单和费用说明。
- 补充贡献指南和[项目许可](LICENSE)。

### 2026-10-17

**English**

- Expanded the collection to **136 Motion Graphics and 46 motions**, refreshed animated previews and cached Motion Graphic summaries, and upgraded [Multiplane](https://github.com/LBEILC/Multiplane) to **0.3.10**.
- Made Activity labels specific to each task, separated preparation, review and repair, and indented updates under their task. Raw internal content stays hidden.
- Anatomy is now installed or updated at launch, with verified offline fallback; upstream skill files are no longer bundled.
- Added automatic narration loudness matching and a volume control, simplified Speech / vocals settings, and registered bundled skills through the Claude SDK.

**简体中文**

- 扩充至 **136 种 Motion Graphic、46 种 motion**，更新动画预览和 Motion Graphic 摘要缓存，并将 [Multiplane](https://github.com/LBEILC/Multiplane) 升级至 **0.3.10**。
- Activity 日志按任务显示具体动作，区分准备、审阅和修复，任务内的更新增加缩进；继续隐藏原始内部内容。
- 新增旁白自动响度匹配和音量控制，简化 Speech / vocals 设置，并通过 Claude SDK 注册随仓库提供的技能。

[0.1.0]: https://github.com/delexw/motion-graphics-agent/releases/tag/v0.1.0
[0.2.0]: https://github.com/delexw/motion-graphics-agent/releases/tag/v0.2.0
[0.3.0]: https://github.com/delexw/motion-graphics-agent/releases/tag/v0.3.0
[0.4.0]: https://github.com/delexw/motion-graphics-agent/releases/tag/v0.4.0
[1.0.0]: https://github.com/delexw/motion-graphics-agent/releases/tag/v1.0.0
