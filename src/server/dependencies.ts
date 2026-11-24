import { refreshSkills } from "./agents/bundled-skills/installation";
import { compatibleBundledSkills } from "./agents/bundled-skills/registry";
import { refreshAudioStudio } from "./agents/capabilities/audio-studio/installation";
import { refreshBevy } from "./agents/capabilities/bevy/installation";
import { installPixelAssetSources } from "./agents/capabilities/pixel-assets/installation";
import { safeMessage } from "./runtime/config";

/** One lifecycle entry point for startup and installation; never runs during generation. */
export async function refreshManagedDependencies(options: {
  signal: AbortSignal;
  audioStudio?: boolean;
  pixelAssets?: boolean;
}) {
  options.signal.throwIfAborted();
  let bevyVersion: string | undefined;
  try {
    const bevy = await refreshBevy({ signal: options.signal });
    bevyVersion = bevy.version;
    if (bevy.status === "fallback")
      console.warn(`Bevy ${bevy.version} retained: ${bevy.limitation}`);
    else console.log(`Bevy ${bevy.version} dependencies are available offline.`);
  } catch (error) {
    options.signal.throwIfAborted();
    console.warn(`Bevy maintenance unavailable: ${safeMessage(error)}`);
  }
  options.signal.throwIfAborted();
  await refreshSkills(compatibleBundledSkills({ bevy: bevyVersion }));
  options.signal.throwIfAborted();
  if (options.pixelAssets !== false) {
    const results = await installPixelAssetSources({
      installIfMissing: options.pixelAssets === true,
      signal: options.signal,
    });
    for (const result of results) {
      if (result.status === "skipped") continue;
      const message = `${result.name} pixel asset source ${result.status}: ${result.detail}`;
      if (result.status === "unavailable" || result.status === "fallback") console.warn(message);
      else console.log(message);
    }
    if (options.pixelAssets === true && results.some(({ status }) => status === "unavailable"))
      throw Error("Pixel asset setup could not finish. Review the source messages above.");
  }
  if (options.audioStudio === false) return;
  try {
    return await refreshAudioStudio({ signal: options.signal, installIfMissing: false });
  } catch (error) {
    options.signal.throwIfAborted();
    console.warn(`Audio Studio maintenance unavailable: ${safeMessage(error)}`);
    return { status: "unavailable" as const };
  }
}
