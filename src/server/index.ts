import { refreshManagedDependencies } from "./dependencies.js";
import { createApp } from "./app.js";
import { jobsDatabasePath, port } from "./runtime/config.js";
import { runBackend } from "./runtime/backend-lifecycle.js";

await runBackend({
  port,
  leaseFile: jobsDatabasePath,
  prepare: (signal) => refreshManagedDependencies({ signal }),
  create: async () => (await createApp()).app,
});
