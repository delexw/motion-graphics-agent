import { afterEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({
  order: [] as string[],
  update: vi.fn(),
  listen: vi.fn(),
  close: vi.fn(),
}));
vi.mock("../src/server/agents/bundled-skills/installation", () => ({
  refreshSkills: async () => {
    calls.order.push("skills");
  },
}));
vi.mock("../src/server/agents/bundled-skills/registry", () => ({ bundledSkills: [] }));
vi.mock("../src/server/agents/capabilities/audio-studio/installation", () => ({
  refreshAudioStudio: calls.update,
}));
vi.mock("../src/server/agents/caveman", () => ({ stopCaveman: vi.fn() }));
vi.mock("../src/server/app", () => ({
  createApp: async () => {
    calls.order.push("app");
    return { app: { listen: calls.listen, close: calls.close } };
  },
}));
const before = new Map(["SIGINT", "SIGTERM"].map((event) => [event, process.listeners(event)]));
afterEach(() => {
  for (const [event, previous] of before)
    for (const listener of process.listeners(event))
      if (!previous.includes(listener)) process.removeListener(event, listener);
  vi.restoreAllMocks();
  calls.order.length = 0;
});
it.each([false, true])(
  "refreshes Audio Studio before serving and keeps the app available on maintenance failure (%s)",
  async (fails) => {
    vi.resetModules();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    calls.update.mockImplementation(async () => {
      calls.order.push("audio");
      if (fails) throw Error("Fixture update failure");
    });
    calls.listen.mockImplementation(async () => {
      calls.order.push("listen");
    });
    await import("../src/server/index");
    expect(calls.order).toEqual(["skills", "audio", "app", "listen"]);
    expect(warn).toHaveBeenCalledTimes(fails ? 1 : 0);
  },
);
