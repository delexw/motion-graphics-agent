import { refreshManagedDependencies } from "./dependencies.js";
import { stopCaveman } from "./agents/caveman.js";
import { createApp } from "./app.js";
import { port } from "./runtime/config.js";
const startup = new AbortController();
const abortStartup = () => startup.abort(Error("Backend startup cancelled"));
for (const event of ["SIGINT", "SIGTERM"]) process.once(event, abortStartup);
try {
  await refreshManagedDependencies({
    signal: AbortSignal.any([startup.signal, AbortSignal.timeout(15 * 60_000)]),
  });
  startup.signal.throwIfAborted();
} finally {
  for (const event of ["SIGINT", "SIGTERM"]) process.off(event, abortStartup);
}
const { app } = await createApp();
await app.listen({ port, host: "127.0.0.1" });
console.log(`Video agent: http://127.0.0.1:${port}`);
for (const event of ["SIGINT", "SIGTERM"])
  process.on(event, () => {
    void app
      .close()
      .then(stopCaveman)
      .then(() => process.exit(0));
  });
