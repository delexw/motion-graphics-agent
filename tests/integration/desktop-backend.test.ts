import { fork } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test as base } from "vitest";

const test = base.extend<{ folder: string }>({
  folder: async ({ task }, use) => {
    const folder = await mkdtemp(path.join(os.tmpdir(), `backend-lifetime-${task.id}-`));
    try {
      await use(folder);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
});

function startFixture(database: string, { pause = false, port = 0, desktop = false } = {}) {
  const child = fork(
    fileURLToPath(new URL("../fixtures/desktop-backend.ts", import.meta.url)),
    [database],
    {
      execArgv: ["--import", "tsx"],
      env: {
        ...process.env,
        FIXTURE_PORT: String(port),
        FIXTURE_PAUSE_STARTUP: pause ? "1" : "",
        KITEVA_DESKTOP_BACKEND: desktop ? "1" : "",
      },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  const exited = once(child, "exit");
  const messages: unknown[] = [];
  child.on("message", (message) => messages.push(message));
  const first = Promise.race([
    once(child, "message").then(([message]) => message),
    exited.then(([code]) => {
      throw Error(`Fixture exited before responding (${code})`);
    }),
  ]);
  function shutdown() {
    if (child.connected) child.send("shutdown", () => {});
    return exited;
  }
  return { child, first, exited, messages, shutdown };
}

test("hands the same database between browser and desktop and blocks overlapping backends", async ({
  folder,
}) => {
  const database = path.join(folder, "test.sqlite");
  const web = startFixture(database);
  try {
    const webReady = await web.first;
    const endpoint = (origin: string) => `${origin}/fixture`;
    await fetch(endpoint(webReady.origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Existing project" }),
    });
    const contender = startFixture(database, { desktop: true });
    try {
      await expect(contender.first).resolves.toMatchObject({
        type: "startup-error",
        message: expect.stringContaining("using this project database"),
      });
      await expect(contender.exited).resolves.toEqual([1, null]);
    } finally {
      await contender.shutdown();
    }
    await expect((await fetch(endpoint(webReady.origin))).json()).resolves.toEqual([
      { text: "Existing project" },
    ]);
    await expect(web.shutdown()).resolves.toEqual([0, null]);
    expect(web.messages).toContainEqual({ type: "closed" });

    const desktop = startFixture(database, { desktop: true });
    try {
      const desktopReady = await desktop.first;
      await expect((await fetch(endpoint(desktopReady.origin))).json()).resolves.toEqual([
        { text: "Existing project" },
      ]);
      await expect(desktop.shutdown()).resolves.toEqual([0, null]);
      await expect(fetch(endpoint(desktopReady.origin))).rejects.toThrow();
    } finally {
      await desktop.shutdown();
    }
  } finally {
    await web.shutdown();
  }
});

test("refuses the occupied backend port before opening a project database", async ({ folder }) => {
  const web = startFixture(path.join(folder, "web.sqlite"));
  try {
    const { origin } = await web.first;
    const desktopDatabase = path.join(folder, "desktop.sqlite");
    const desktop = startFixture(desktopDatabase, {
      port: Number(new URL(origin).port),
      desktop: true,
    });
    try {
      await expect(desktop.first).resolves.toMatchObject({
        type: "startup-error",
        message: expect.stringContaining("already in use"),
      });
      await expect(desktop.exited).resolves.toEqual([1, null]);
      await expect(access(desktopDatabase)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await desktop.shutdown();
    }
  } finally {
    await web.shutdown();
  }
});

test("cancels startup and releases the database when the app quits", async ({ folder }) => {
  const database = path.join(folder, "test.sqlite");
  const desktop = startFixture(database, { pause: true, desktop: true });
  try {
    await expect(desktop.first).resolves.toEqual({ type: "preparing" });
    await expect(desktop.shutdown()).resolves.toEqual([0, null]);
    expect(desktop.messages).toEqual([{ type: "preparing" }]);
    const web = startFixture(database);
    try {
      await expect(web.first).resolves.toMatchObject({ type: "ready" });
    } finally {
      await web.shutdown();
    }
  } finally {
    await desktop.shutdown();
  }
});

test("stops when the app loses its connection to the service", async ({ folder }) => {
  const desktop = startFixture(path.join(folder, "test.sqlite"), { desktop: true });
  try {
    await expect(desktop.first).resolves.toMatchObject({ type: "ready" });
    desktop.child.disconnect();
    await expect(desktop.exited).resolves.toEqual([0, null]);
  } finally {
    await desktop.shutdown();
  }
});
