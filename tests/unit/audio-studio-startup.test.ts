import { afterEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({
  order: [] as string[],
  update: vi.fn(),
  pixelUpdate: vi.fn(),
  listen: vi.fn(),
  close: vi.fn(),
}));
vi.mock("../../src/server/agents/bundled-skills/installation", () => ({
  refreshSkills: async () => {
    calls.order.push("skills");
  },
}));
vi.mock("../../src/server/agents/capabilities/bevy/installation", () => ({
  refreshBevy: async () => {
    calls.order.push("bevy");
    return { status: "current", version: "0.20.1" };
  },
}));
vi.mock("../../src/server/agents/capabilities/audio-studio/installation", () => ({
  refreshAudioStudio: calls.update,
}));
vi.mock("../../src/server/agents/capabilities/pixel-assets/installation", () => ({
  installPixelAssetSources: calls.pixelUpdate,
}));
vi.mock("../../src/server/app", () => ({
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
  calls.pixelUpdate.mockReset();
});
it.each([false, true])(
  "refreshes Audio Studio before serving and keeps the app available on maintenance failure (%s)",
  async (fails) => {
    vi.resetModules();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    calls.pixelUpdate.mockImplementation(async () => {
      calls.order.push("pixel assets");
      return [];
    });
    calls.update.mockImplementation(async () => {
      calls.order.push("audio");
      if (fails) throw Error("Fixture update failure");
    });
    calls.listen.mockImplementation(async () => {
      calls.order.push("listen");
    });
    await import("../../src/server/index");
    expect(calls.order).toEqual(["bevy", "skills", "pixel assets", "audio", "app", "listen"]);
    expect(calls.pixelUpdate).toHaveBeenCalledWith({
      installIfMissing: false,
      signal: expect.any(AbortSignal),
    });
    expect(warn).toHaveBeenCalledTimes(fails ? 1 : 0);
  },
);

it("provisions missing pixel asset sources only when requested by dependency setup", async () => {
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  calls.pixelUpdate.mockResolvedValue([]);
  const { refreshManagedDependencies } = await import("../../src/server/dependencies");
  const signal = new AbortController().signal;
  await refreshManagedDependencies({ signal, audioStudio: false, pixelAssets: true });
  expect(calls.pixelUpdate).toHaveBeenCalledExactlyOnceWith({ signal, installIfMissing: true });
  calls.pixelUpdate.mockClear();
  await refreshManagedDependencies({ signal, audioStudio: false, pixelAssets: false });
  expect(calls.pixelUpdate).not.toHaveBeenCalled();
});
