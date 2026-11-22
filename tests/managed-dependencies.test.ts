import { afterEach, beforeEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({
  skills: vi.fn(),
  audio: vi.fn(),
  bevy: vi.fn(),
}));
vi.mock("../src/server/agents/bundled-skills/installation", () => ({
  refreshSkills: calls.skills,
}));
vi.mock("../src/server/agents/capabilities/audio-studio/installation", () => ({
  refreshAudioStudio: calls.audio,
}));
vi.mock("../src/server/agents/capabilities/bevy/installation", () => ({ refreshBevy: calls.bevy }));
import { refreshManagedDependencies } from "../src/server/dependencies";
beforeEach(() => {
  calls.bevy.mockResolvedValue({ status: "current", version: "1.2.3" });
});
afterEach(() => {
  vi.restoreAllMocks();
  calls.skills.mockReset();
  calls.audio.mockReset();
  calls.bevy.mockReset();
});
it("uses the same sequential updater for setup and launch, with automatic first-install disabled", async () => {
  const order: string[] = [];
  calls.skills.mockImplementation(async () => {
    order.push("skills");
  });
  calls.bevy.mockImplementation(async () => {
    order.push("bevy");
    return { status: "current", version: "1.2.3" };
  });
  calls.audio.mockImplementation(async () => {
    order.push("audio");
    return { status: "current" };
  });
  const signal = new AbortController().signal;
  expect(await refreshManagedDependencies({ signal })).toEqual({ status: "current" });
  expect(order).toEqual(["bevy", "skills", "audio"]);
  expect(calls.audio).toHaveBeenCalledWith({ signal, installIfMissing: false });
});
it("respects installer opt-out without skipping shared skills or Bevy", async () => {
  await refreshManagedDependencies({ signal: new AbortController().signal, audioStudio: false });
  expect(calls.skills).toHaveBeenCalledOnce();
  expect(calls.bevy).toHaveBeenCalledOnce();
  expect(calls.audio).not.toHaveBeenCalled();
});
it("reports maintenance failure while allowing startup to continue", async () => {
  calls.audio.mockRejectedValue(Error("Fixture failure"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(await refreshManagedDependencies({ signal: new AbortController().signal })).toEqual({
    status: "unavailable",
  });
});
it("propagates cancellation before starting the next updater", async () => {
  const controller = new AbortController();
  calls.bevy.mockImplementation(async () => {
    controller.abort();
  });
  await expect(refreshManagedDependencies({ signal: controller.signal })).rejects.toThrow();
  expect(calls.skills).not.toHaveBeenCalled();
  expect(calls.audio).not.toHaveBeenCalled();
});

it.each([
  [{ status: "current", version: "0.20.1" }, true],
  [{ status: "fallback", version: "0.20.3", limitation: "Fixture update failed" }, true],
  [{ status: "current", version: "0.21.0" }, false],
])(
  "passes only compatible registry entries to the shared updater (%o)",
  async (runtime, compatible) => {
    calls.bevy.mockResolvedValue(runtime);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await refreshManagedDependencies({ signal: new AbortController().signal });
    expect(calls.skills).toHaveBeenCalledOnce();
    const [skills] = calls.skills.mock.calls[0];
    expect(skills.some((skill: { id: string }) => skill.id === "bevy")).toBe(compatible);
    expect(skills.some((skill: { id: string }) => skill.id === "anatomy")).toBe(true);
    expect(calls.audio).toHaveBeenCalledOnce();
  },
);

it("refreshes other skills and Audio Studio when Bevy cannot be prepared", async () => {
  calls.bevy.mockRejectedValue(Error("Fixture unavailable"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await refreshManagedDependencies({ signal: new AbortController().signal });
  expect(calls.skills).toHaveBeenCalledOnce();
  const [skills] = calls.skills.mock.calls[0];
  expect(skills.some((skill: { id: string }) => skill.id === "bevy")).toBe(false);
  expect(calls.audio).toHaveBeenCalledOnce();
});
