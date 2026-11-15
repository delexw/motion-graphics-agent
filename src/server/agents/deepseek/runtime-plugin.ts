import { installDeepSeekCostBridge, type DeepSeekCostBridgeContext } from "./cost-meter";
import { deepseekToolAllowed, deepseekToolDenial, type DeepSeekToolPolicy } from "./policy";

/** Narrow plugin surface; the installed Harness owns service implementations. */
type PolicyContext = DeepSeekCostBridgeContext & {
  tools: {
    definitions(): { name: string }[];
    restrict(filter: { deny: string[] }): () => void;
    guard(
      check: (execution: { name: string; arguments: unknown }) => string | undefined,
    ): () => void;
  };
  on(event: "agent/created", handler: (payload: { agent: { ctx: PolicyContext } }) => void): void;
  on(
    event: "system-prompt/assemble",
    handler: (
      assembly: { sections: unknown[] },
      context: unknown,
      next: () => Promise<{ sections: unknown[] }>,
    ) => Promise<{ sections: unknown[] }>,
  ): void;
};
export const name = "kiteva-policy";
export const inject = ["tools", "systemPrompt", "costMeter"];

export async function apply(
  ctx: PolicyContext,
  config: DeepSeekToolPolicy & { systemPrompt: string; costFile?: string },
) {
  if (config.costFile) await installDeepSeekCostBridge(ctx, config.costFile);
  ctx.tools.guard((execution) => deepseekToolDenial(execution.name, execution.arguments, config));
  ctx.on("agent/created", ({ agent }) => {
    const names = agent.ctx.tools.definitions().map(({ name }) => name);
    for (const expected of config.allowedMcpTools) {
      if (!names.includes(expected))
        throw Error(`Required Kiteva tool did not register: ${expected}`);
    }
    const deny = names.filter((name) => !deepseekToolAllowed(name, config));
    if (deny.length) agent.ctx.tools.restrict({ deny });
  });
  ctx.on("system-prompt/assemble", async (_assembly, _context, next) => {
    const assembly = await next();
    assembly.sections = [{ name: "kiteva", text: config.systemPrompt, interpolate: false }];
    return assembly;
  });
}
