import { EventEmitter } from "node:events";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("pidtree", () => ({ default: vi.fn(async () => []) }));
import { spawn } from "node:child_process";
import { terminateProcessTree } from "../src/server/runtime/process-tree";
beforeEach(() => vi.clearAllMocks());
it("kills only the owned Windows process tree without shell evaluation and waits for taskkill", async () => {
  const killer = new EventEmitter();
  vi.mocked(spawn).mockReturnValue(killer as ReturnType<typeof spawn>);
  const stopping = terminateProcessTree(1234, { platform: "win32" });
  await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
  expect(spawn).toHaveBeenCalledWith(
    expect.stringMatching(/System32\\taskkill\.exe$/),
    ["/PID", "1234", "/T", "/F"],
    { stdio: "ignore", windowsHide: true },
  );
  let finished = false;
  void stopping.then(() => {
    finished = true;
  });
  expect(finished).toBe(false);
  killer.emit("close", 0);
  await stopping;
});
it("rejects invalid PIDs instead of targeting the current group", async () => {
  for (const pid of [undefined, 0, -1, NaN, 1.2])
    await terminateProcessTree(pid, { platform: "win32" });
  expect(spawn).not.toHaveBeenCalled();
});
it("retains Unix group termination and escalates only owned processes", async () => {
  let running = true;
  const kill = vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
    if (signal === "SIGKILL" && pid === 2345) running = false;
    if (signal === 0 && !running) throw Object.assign(Error("Exited"), { code: "ESRCH" });
    return true;
  });
  try {
    await terminateProcessTree(2345, { processGroup: true, platform: "darwin", graceMs: 0 });
    expect(kill).toHaveBeenCalledWith(-2345, "SIGTERM");
    expect(kill).toHaveBeenCalledWith(-2345, "SIGKILL");
    expect(kill).toHaveBeenCalledWith(2345, "SIGKILL");
  } finally {
    kill.mockRestore();
  }
});

it("does not signal a macOS group after the owned processes have exited", async () => {
  const kill = vi.spyOn(process, "kill").mockImplementation((_pid, signal) => {
    if (signal === 0) throw Object.assign(Error("Exited"), { code: "ESRCH" });
    throw Object.assign(Error("Process group is no longer owned"), { code: "EPERM" });
  });
  try {
    await expect(
      terminateProcessTree(2345, { processGroup: true, platform: "darwin" }),
    ).resolves.toBeUndefined();
    expect(kill.mock.calls.every(([, signal]) => signal === 0)).toBe(true);
  } finally {
    kill.mockRestore();
  }
});

it.each([true, false])(
  "handles a macOS group permission error only if all owned processes have exited (%s)",
  async (exited) => {
    let running = true;
    const kill = vi.spyOn(process, "kill").mockImplementation((_pid, signal) => {
      if (signal === 0) {
        if (!running) throw Object.assign(Error("Exited"), { code: "ESRCH" });
        return true;
      }
      running = !exited;
      throw Object.assign(Error("Unable to signal group"), { code: "EPERM" });
    });
    try {
      const stopping = terminateProcessTree(2345, { processGroup: true, platform: "darwin" });
      if (exited) await expect(stopping).resolves.toBeUndefined();
      else await expect(stopping).rejects.toMatchObject({ code: "DEPENDENCY_CLEANUP_FAILED" });
    } finally {
      kill.mockRestore();
    }
  },
);
