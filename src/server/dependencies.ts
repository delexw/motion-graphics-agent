import { refreshSkills } from "./agents/bundled-skills/installation";
import { bundledSkills } from "./agents/bundled-skills/registry";
import { refreshAudioStudio } from "./agents/capabilities/audio-studio/installation";
import { safeMessage } from "./runtime/config";

/** One lifecycle entry point for startup and installation; never runs during generation. */
export async function refreshManagedDependencies(options: {
  signal: AbortSignal;
  audioStudio?: boolean;
}) {
  options.signal.throwIfAborted();
  await refreshSkills(bundledSkills);
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
