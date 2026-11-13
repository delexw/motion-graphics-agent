import { parseArgs } from "node:util";
import { refreshManagedDependencies } from "../src/server/dependencies";
import { safeMessage } from "../src/server/runtime/config";

const { values } = parseArgs({
  options: { "skip-audio-studio": { type: "boolean", default: false } },
});
const controller = new AbortController();
const abort = () => controller.abort(Error("Dependency update cancelled"));
for (const event of ["SIGINT", "SIGTERM"]) process.once(event, abort);
try {
  const result = await refreshManagedDependencies({
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15 * 60_000)]),
    audioStudio: !values["skip-audio-studio"],
  });
  if (result?.status === "unavailable") process.exitCode = 1;
} catch (error) {
  console.error(`Dependency update failed: ${safeMessage(error)}`);
  process.exitCode = 1;
} finally {
  for (const event of ["SIGINT", "SIGTERM"]) process.off(event, abort);
}
