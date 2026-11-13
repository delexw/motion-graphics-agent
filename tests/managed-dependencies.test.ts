import { afterEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ skills: vi.fn(), audio: vi.fn() }));
vi.mock("../src/server/agents/bundled-skills/installation", () => ({
  refreshSkills: calls.skills,
}));
vi.mock("../src/server/agents/bundled-skills/registry", () => ({ bundledSkills: [] }));
vi.mock("../src/server/agents/capabilities/audio-studio/installation", () => ({
  refreshAudioStudio: calls.audio,
}));
import { refreshManagedDependencies } from "../src/server/dependencies";
afterEach(() => {
  vi.restoreAllMocks();
  calls.skills.mockReset();
  calls.audio.mockReset();
});
it("uses the same sequential updater for setup and launch, with automatic first-install disabled", async () => {
  const order: string[] = [];
  calls.skills.mockImplementation(async () => {
    order.push("skills");
  });
  calls.audio.mockImplementation(async () => {
    order.push("audio");
    return { status: "current" };
  });
  const signal = new AbortController().signal;
  expect(await refreshManagedDependencies({ signal })).toEqual({ status: "current" });
  expect(order).toEqual(["skills", "audio"]);
  expect(calls.audio).toHaveBeenCalledWith({ signal, installIfMissing: false });
});
it("respects installer opt-out without skipping shared skills", async () => {
  await refreshManagedDependencies({ signal: new AbortController().signal, audioStudio: false });
  expect(calls.skills).toHaveBeenCalledOnce();
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
  calls.skills.mockImplementation(async () => {
    controller.abort();
  });
  await expect(refreshManagedDependencies({ signal: controller.signal })).rejects.toThrow();
  expect(calls.audio).not.toHaveBeenCalled();
});
