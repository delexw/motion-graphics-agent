# Reference-image procedural 3D authoring

Kiteva registers img2threejs alongside Anatomy in the existing JEV authoring-resource choice. JEV compares the brief, inspected image descriptions, available image metadata, selected Motion Graphics and renderer. There is one primary resource per job. An explicit compatible request is honored; merely mentioning an image or Three.js does not force reconstruction. UI resources and local code remain candidates.

Use img2threejs when a specific pictured product, prop or object needs recognizable editable 3D geometry. Use Anatomy when an explanatory mechanism or detailed isometric technical figure serves the idea better. Neither base skill guarantees complex skinned-character animation.

## Installation and evidence

Like Anatomy, img2threejs downloads the latest default-branch commit at every backend startup through Kiteva's HTTPS ZIP loader. The resolved commit and file hashes are recorded in the local manifest; integrity verification does not imply a separate review of each new upstream commit. Failed updates retain the last verified local installation. It never runs the upstream global installer or imports global agent settings. Upstream material remains under Git-ignored `skills/img2threejs/` and retains its Apache-2.0 license. No new npm dependency is needed.

Claude discovers `bundled-authoring:img2threejs`; Codex reads `.agents/skills/img2threejs/SKILL.md` in its isolated project. Both receive the same Kiteva-owned adaptation guidance. Python 3.10+ and project-local Three.js/addons must be checked before running forge. The skill being staged does not prove those runtimes, generated code or optional plugins are usable. Missing installations follow the existing file-enabled-turn setup error; verified offline installations remain usable.

## Production workflow

1. Read the installed skill and relevant forge/grimoire references. Inspect the actual supplied subject image and retain its provenance/hash.
2. Keep assessment, ObjectSculptSpec, explicit local state path, generated TypeScript and review evidence in a per-asset folder under the designated render inputs. Pass absolute paths to forge scripts; never write generated work inside the skill checkout.
3. Follow the native intake/spec/build/review gates. Resume through `forge/next.py`; stopped state/exit 3 is a hard stop. Preserve failed candidates and default correction limits (three per pass, six total). Do not use the upstream non-strict fixture escape hatch for production.
4. Import the generated factory into the selected composition. Keep the existing renderer, planned palette, lighting and framing. Do not adopt standalone OrbitControls, a new renderer or wall-clock animation loops.
5. Render actual browser views and inspect saved pixels. A model PASS or state file is not quality evidence. Record source-view likeness, visible details and inferred hidden surfaces separately. Review final encoded frames too.

## Timeline and capture helper

Each file-enabled turn stages a Kiteva-owned `vendor/procedural-model.ts` under the active render-input root (`artifacts/vendor/` in versioned projects). Use a relative import from the composition; it is outside the upstream skill and can be bundled by the project's existing tooling.

```ts
const root = createObjectModel(); // generated factory
scene.add(root);
const controller = createProceduralModelController(root, (seconds, runtime) => {
  runtime.nodes.hinge.rotation.y = Math.sin(seconds) * 0.4;
});
// Called by the selected renderer's absolute-time frame callback:
controller.setTime(timeSeconds);
renderer.render(scene, camera);
```

The controller restores initial position/quaternion/scale/visibility before each pose, then updates world matrices. The author must set every animated material, shader or other custom value from time on every call; the controller does not infer animation or reset arbitrary application state. Treat the generated hierarchy as fixed after controller creation. Recreate the controller if geometry/hierarchy changes.

Call `controller.dispose()` when unloading. It detaches the group and disposes its mesh geometries, materials and direct texture properties once. Pass `disposeResources: false` for externally shared resources, and `onDispose` for separately owned render targets, shader-uniform textures or other cleanup. Disposal is idempotent; subsequent poses fail explicitly.

For a local review route, expose `window.__IMG2THREEJS_CAPTURE__ = createProceduralModelCapture(camera, drawCurrentFrame)` after creating the real scene. Set `window.__IMG2THREEJS_READY__ = true` only after assets/textures are ready. `setCamera` requires explicit azimuth/elevation, target, distance, field of view and near/far clipping planes. It updates the actual camera and renders synchronously. Supply the same camera contract for paired comparisons. The host review route owns screenshots, hashes, manifests and restoration of the production camera; this helper does not save captures or create an MCP/browser service.

## Verification and limits

Local unit/provider tests cover discovery, startup upgrades/offline behavior, image evidence, workspace boundaries, pose reset, disposal and camera validation. The browser integration fixture renders actual Three.js pixels and checks changed poses plus repeatability after backward/direct seeks, camera restoration and a fresh page. This verifies the adapter, not an agent's creative reconstruction quality. Real generated objects and their final selected-renderer exports still require visual review.

One image cannot establish hidden geometry or exact multi-angle fidelity. Some upstream paths use declared reference-derived textures. Animated-character plugins, hosted mesh conversion and alternate emission targets remain separate scopes; no automatic installation or claim of support is made. Existing style/MG/renderer decisions remain authoritative throughout.

The procedural browser integration tests require a local browser and an installed img2threejs checkout (start Kiteva once to prepare it). Missing prerequisites fail these checks rather than silently skipping them. The upstream factory test resolves the active manifest revision, so it follows startup updates rather than a hard-coded checkout path.
