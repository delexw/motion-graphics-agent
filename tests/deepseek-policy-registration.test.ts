import { expect, it, vi } from "vitest";
import { apply } from "../src/server/agents/deepseek/runtime-plugin";

async function fixture() {
  const context = {
    costMeter: { updateConfig: vi.fn(), getTurnCost: vi.fn() },
    effect: vi.fn(),
    tools: {
      definitions: vi.fn(() => [
        { name: "read" },
        { name: "write" },
        { name: "web_fetch" },
        { name: "mcp__fixture__inspect" },
      ]),
      restrict: vi.fn(() => () => {}),
      guard: vi.fn<Parameters<typeof apply>[0]["tools"]["guard"]>(() => () => {}),
    },
    on: vi.fn(),
  };
  await apply(context, {
    textOnly: false,
    readOnly: true,
    allowedMcpTools: ["mcp__fixture__inspect"],
    systemPrompt: "exact {{literal}} instructions",
  });
  return context;
}
it("registers restrictions before agent use and retains a monotonic dispatch guard", async () => {
  const ctx = await fixture();
  const created = ctx.on.mock.calls.find((call) => call[0] === "agent/created")![1];
  created({ agent: { ctx } });
  expect(ctx.tools.restrict).toHaveBeenCalledWith({ deny: ["write", "web_fetch"] });
  const guard = ctx.tools.guard.mock.calls[0][0];
  expect(guard({ name: "write", arguments: {} })).toContain("unavailable");
  expect(guard({ name: "mcp__fixture__inspect", arguments: {} })).toBeUndefined();
});
it("fails before model work when a required MCP tool is absent", async () => {
  const ctx = await fixture();
  ctx.tools.definitions.mockReturnValue([{ name: "read" }]);
  const created = ctx.on.mock.calls.find((call) => call[0] === "agent/created")![1];
  expect(() => created({ agent: { ctx } })).toThrow("Required Kiteva tool did not register");
});
it("uses the recorded system prompt literally while retaining runtime context", async () => {
  const ctx = await fixture();
  const present = ctx.on.mock.calls.find((call) => call[0] === "system-prompt/assemble")![1];
  const result = await present({}, {}, async () => ({
    sections: [{ text: "runtime persona" }],
    contexts: [{ text: "workspace context" }],
  }));
  expect(result).toEqual({
    sections: [{ name: "kiteva", text: "exact {{literal}} instructions", interpolate: false }],
    contexts: [{ text: "workspace context" }],
  });
});
