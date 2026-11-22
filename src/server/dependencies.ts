import { refreshSkills } from "./agents/bundled-skills/installation";
import { compatibleBundledSkills } from "./agents/bundled-skills/registry";
import { refreshAudioStudio } from "./agents/capabilities/audio-studio/installation";
import { refreshBevy } from "./agents/capabilities/bevy/installation";
import { safeMessage } from "./runtime/config";

/** One lifecycle entry point for startup and installation; never runs during generation. */
export async function refreshManagedDependencies(options: {
  signal: AbortSignal;
  audioStudio?: boolean;
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
  if (options.audioStudio === false) return;
  try {
    return await refreshAudioStudio({ signal: options.signal, installIfMissing: false });
  } catch (error) {
    options.signal.throwIfAborted();
    console.warn(`Audio Studio maintenance unavailable: ${safeMessage(error)}`);
    return { status: "unavailable" as const };
  }
}
