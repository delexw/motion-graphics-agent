import { expect, it, vi } from "vitest";

const createTools = vi.hoisted(() => vi.fn());
vi.mock("../src/server/agents/capabilities/reference-browser/tools", () => ({
  createReferenceTools: createTools,
}));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {},
}));

it("keeps the browser MCP alive beyond ten minutes and closes on run shutdown", async () => {
  vi.useFakeTimers();
  const originalArguments = process.argv;
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const shutdownHandlers = new Map<string, () => void>();
  vi.spyOn(process, "once").mockImplementation((event, listener) => {
    shutdownHandlers.set(String(event), listener);
    return process;
  });
  vi.spyOn(process.stdin, "once").mockImplementation((event, listener) => {
    shutdownHandlers.set(`stdin:${String(event)}`, listener);
    return process.stdin;
  });
  const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  const connect = vi.fn(async () => {});
  const close = vi.fn(async () => {});
  createTools.mockReturnValue({ server: { connect }, close });
  process.argv = [
    "node",
    "server",
    JSON.stringify({
      workspace: "/tmp/example",
      urls: ["https://example.com"],
      mode: "local",
    }),
  ];
  try {
    await import("../src/server/agents/capabilities/reference-browser/server");
    const signal: AbortSignal = createTools.mock.calls[0][0].signal;
    expect(connect).toHaveBeenCalledOnce();
    expect(timeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(61 * 60 * 1000);
    expect(signal.aborted).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect([...shutdownHandlers.keys()]).toEqual(["SIGTERM", "SIGINT", "stdin:end"]);
    shutdownHandlers.get("SIGTERM")!();
    await Promise.resolve();
    expect(signal.aborted).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  } finally {
    process.argv = originalArguments;
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});
