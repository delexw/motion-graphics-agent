# Stageshow product demonstrations

Stageshow is an optional authoring resource for simulated React/CSS product UI,
cursor walkthroughs and feature illustrations. It complements the selected Motion
Graphics; it does not select the MG, replace the saved renderer, or prove that a
real application works. Required authentic footage continues through the existing
[OpenScreen capture workflow](../src/server/domains/video/route-prompts/openscreen-demo.md).

## Source, installation and licensing

The registration uses [benjitaylor/skills](https://github.com/benjitaylor/skills),
subdirectory `stageshow/`. The shared installer checks the latest default-branch
archive at backend startup, records the resolved commit and hashes, and stages
only that subdirectory for both Claude and Codex. It does not read user-global
skills, execute upstream installation scripts or modify running workspaces.
Updates and verified offline fallback follow the existing
[dependency lifecycle](dependency-upgrades.md).

The upstream [LICENSE](https://github.com/benjitaylor/skills/blob/main/stageshow/LICENSE)
is MIT, copyright 2026 Benji Taylor. Preserve it with copied kit code. Preserve
[NOTICE.md](https://github.com/benjitaylor/skills/blob/main/stageshow/NOTICE.md)
and applicable per-asset notices: app icons are not all covered by MIT, and brand
artwork retains its own terms. The bundle is not a blanket license for those
assets. Use original generic graphics or permitted user assets in new demos;
do not copy another product's identity or imply endorsement.

## Selection and renderer boundaries

JEV compares Stageshow with other visual-authoring resources through the existing
governed resource-selection strategy. Explicit compatible requests can select it.
Both providers receive the same installation and guidance. Local code remains
available. Explicit user UI appearance instructions override Stageshow defaults;
otherwise the demo retains Stageshow's native palette, typography, materials and
layout. Selected MGs contribute motion, pacing, choreography and transitions only
inside that demo. Planning, refinement, repair and result review share this scoped
ownership rule; MG appearance remains applicable outside the demo. Read and adapt the closest upstream example rather than
renaming its product.

For interactive pages, native Stage scripts can provide playback, Replay and a
reduced-motion poster. For video, the native async Stage/Act script and forward-only
virtual clock do not provide arbitrary seeking. Reuse the visual kit with state,
pointer positions and transitions derived from absolute renderer time. Do not
replace the renderer's clocks with a second global clock. Verify matching frames
after direct, forward, backward and fresh-page seeks. A sampled contact sheet or
an automated gate is not proof of complete temporal quality.

Copy only needed kit/CSS modules and notices into the generated project. Declare
actual runtime dependencies using the existing
[project dependency lifecycle](technology-pool.md#final-project-dependencies-and-usage-monitoring);
do not copy the upstream playground's dependency list or launch its development
server as the production output.
Resolve the scene, copied kit and JSX runtimes against one project-local
React/ReactDOM instance, including vendor modules outside a nested build folder.
Mixed React copies can break hooks even when bundling succeeds.

## Verification

Codebase tests use local archives, synthetic skill files and mocked provider/JEV
responses for subdirectory validation, license preservation, both-provider staging,
selection, updates and offline fallback. They make no external inference calls.
User-requested live MCP builds are separate acceptance runs stored under ignored
`work/`; inspect their actual rendered output and retain measured limitations.
Evaluate resource selection with ordinary product briefs that do not name the
skill, prescribe a framework or identify themselves as tests. Judge the returned
choice against the task and resource descriptions, then inspect the output;
probabilities alone do not establish quality or optimality. A forced-resource
probe verifies integration only, not independent JEV selection.
