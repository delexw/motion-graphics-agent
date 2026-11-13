import { refreshAudioStudio } from "../src/server/agents/capabilities/audio-studio/installation";
import { safeMessage } from "../src/server/runtime/config";

const controller = new AbortController();
const abort = () => controller.abort(Error("Audio Studio update cancelled"));
for (const event of ["SIGINT", "SIGTERM"]) process.once(event, abort);
try {
  const result = await refreshAudioStudio({
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15 * 60_000)]),
  });
  if (result.status === "unavailable") process.exitCode = 1;
} catch (error) {
  console.error(`Audio Studio update failed: ${safeMessage(error)}`);
  process.exitCode = 1;
} finally {
  for (const event of ["SIGINT", "SIGTERM"]) process.off(event, abort);
}
