import path from "node:path";
import { userHome } from "../../../runtime/platform";
import { managedBevyRuntime } from "./installation";

export const bevyGuidance = `Read authoringResources in style-context.json. Planning can choose Bevy for the scene. Only build turns can use bevy.render_frames. The project renderer owns final export.`;

export function bevyBuildGuidance(runtime = managedBevyRuntime(), routerPath?: string) {
  const authoring = routerPath
    ? `For Bevy authoring, read the community Bevy skill router at ${JSON.stringify(routerPath)} first, then open the relevant sibling skill's SKILL.md. Use the guides only if the project's locked Bevy version is 0.20. Kiteva's locked Cargo configuration, workspace rules and frame export contract take precedence over upstream setup, dependency changes and capture instructions.`
    : "The matching community Bevy skill is unavailable for this build. Consult the official Bevy headless renderer example at the version locked in the project.";
  const exportContract =
    "Call bevy.render_frames with the project-relative executable and shot parameters. The executable must take --output-dir, --width, --height, --fps and --frames, write PNGs from frame-000000.png, and exit after the last frame. The tool verifies the frames before publishing them. Integrate the exported media into the selected composition and verify deterministic seeking.";
  const instructions = `${bevyGuidance} ${authoring} ${exportContract}`;
  if (!runtime) return instructions;
  const rustupHome = process.env.RUSTUP_HOME ?? path.join(userHome(), ".rustup");
  return (
    instructions +
    ` Kiteva prepared Bevy ${runtime.version}. For a new scene, copy Cargo.toml and Cargo.lock from ${JSON.stringify(runtime.directory)} to the project crate and build with cargo build --offline --locked --config ${JSON.stringify(runtime.config)}. If Cargo uses rustup, set RUSTUP_HOME to ${JSON.stringify(rustupHome)} for the build command so the isolated agent home still finds the installed toolchain. The vendored dependencies are shared read-only. Use the release matching the project's lockfile for an existing scene.`
  );
}
