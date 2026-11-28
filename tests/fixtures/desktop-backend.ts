import Fastify from "fastify";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { runBackend } from "../../src/server/runtime/backend-lifecycle";

const database = process.argv[2];
await runBackend({
  port: Number(process.env.FIXTURE_PORT || 0),
  leaseFile: database,
  prepare: async (signal) => {
    if (!process.env.FIXTURE_PAUSE_STARTUP) return;
    process.send?.({ type: "preparing" });
    await delay(60_000, undefined, { signal });
  },
  create: async () => {
    const store = new DatabaseSync(database);
    store.exec("CREATE TABLE IF NOT EXISTS notes (text TEXT)");
    const app = Fastify();
    app.get("/fixture", async () => store.prepare("SELECT text FROM notes").all());
    app.post<{ Body: { text: string } }>("/fixture", async (request) => {
      store.prepare("INSERT INTO notes (text) VALUES (?)").run(request.body.text);
      return { saved: true };
    });
    app.addHook("onClose", async () => {
      store.close();
      if (process.connected) process.send?.({ type: "closed" }, () => {});
    });
    return app;
  },
});
