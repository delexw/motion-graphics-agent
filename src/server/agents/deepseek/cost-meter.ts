import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { ProviderEvent } from "../agent";

const PriceRowSchema = z.object({
  bucket: z.string(),
  tokens: z.number().finite().nonnegative(),
  rate: z.number().finite().nonnegative(),
  cost: z.number().finite().nonnegative(),
  priced: z.boolean(),
  plan: z.boolean(),
});
const CallSchema = z.object({
  logSeq: z.number().int().nonnegative().nullable().optional(),
  model: z.string(),
  provider: z.string(),
  priced: z.boolean(),
  plan: z.boolean(),
  cost: z.number().finite().nonnegative(),
  apiCost: z.number().finite().nonnegative(),
  rows: z.array(PriceRowSchema),
});
const CostRecordSchema = z.object({
  usageId: z.string(),
  model: z.string(),
  priced: z.boolean(),
  costUsd: z.number().finite().nonnegative().nullable(),
  rows: z.array(PriceRowSchema),
});
const CostFileSchema = z.object({
  version: z.literal(1),
  source: z.literal("dsh-cost-meter"),
  records: z.array(CostRecordSchema),
});
export type DeepSeekCostRecord = z.infer<typeof CostRecordSchema>;

export interface DeepSeekCostBridgeContext {
  costMeter: {
    updateConfig(config: unknown): Promise<unknown>;
    getTurnCost(sessionId: string, start: number, end: number, currency: string): Promise<unknown>;
  };
  on(
    event: "session/event",
    handler: (
      session: { id: string },
      event: { type: string; seq: number; data: Record<string, unknown> },
    ) => void,
  ): void;
  effect(effect: () => () => Promise<void>, label?: string): void;
}

/** Consume the installed plugin's public cost service; never implement a second rate calculator. */
export async function installDeepSeekCostBridge(ctx: DeepSeekCostBridgeContext, costFile: string) {
  await ctx.costMeter.updateConfig({
    currency: "USD",
    symbol: "$",
    pricingCurrency: "USD",
    exchangeRateAuto: false,
    position: "off",
    sidebar: false,
    peakAlertEnabled: false,
    balance: { display: "off", reconcile: false },
    goQuota: { enabled: false },
    codexQuotaEnabled: false,
    customBalance: { enabled: false },
  });
  const starts = new Map<string, number>();
  const records = new Map<string, DeepSeekCostRecord>();
  let pending = Promise.resolve();
  ctx.on("session/event", (session, event) => {
    if (event.type === "turn/start") starts.set(`${session.id}:${event.data.turn}`, event.seq);
    if (event.type !== "turn/end") return;
    const key = `${session.id}:${event.data.turn}`;
    const start = starts.get(key);
    starts.delete(key);
    if (start === undefined) return;
    pending = pending
      .then(async () => {
        const report = z
          .object({ calls: z.array(CallSchema) })
          .parse(await ctx.costMeter.getTurnCost(session.id, start, event.seq, "USD"));
        for (const call of report.calls) {
          if (call.logSeq === null || call.logSeq === undefined) continue;
          const usageId = `deepseek:${session.id}:${call.logSeq}`;
          const supported = [
            "deepseek-flash",
            "deepseek-v4-pro",
            "deepseek-v4-flash",
            "deepseek-v4-flash-vision-exp",
          ].includes(call.model);
          const priced =
            call.priced &&
            !call.plan &&
            supported &&
            call.rows.every((row) => row.priced && !row.plan);
          records.set(usageId, {
            usageId,
            model: call.model,
            priced,
            costUsd: priced ? call.apiCost : null,
            rows: call.rows,
          });
        }
        await writeFile(
          costFile,
          JSON.stringify({ version: 1, source: "dsh-cost-meter", records: [...records.values()] }),
          { mode: 0o600 },
        );
      })
      .catch(() => {
        // Missing/invalid plugin accounting must remain unknown; token events survive independently.
      });
  });
  ctx.effect(() => () => pending, "kiteva: await plugin cost accounting");
}

export async function readDeepSeekCosts(file: string | undefined) {
  if (!file) return new Map<string, DeepSeekCostRecord>();
  const text = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (text === undefined) return new Map<string, DeepSeekCostRecord>();
  const parsed = CostFileSchema.parse(JSON.parse(text));
  return new Map(parsed.records.map((record) => [record.usageId, record]));
}
export function attachDeepSeekCost(
  event: ProviderEvent,
  costs: ReadonlyMap<string, DeepSeekCostRecord>,
): ProviderEvent {
  const data = event.data as {
    usageId: string;
    input_tokens: number | null;
    output_tokens: number | null;
  };
  const cost = costs.get(data.usageId);
  if (
    !cost?.priced ||
    cost.costUsd === null ||
    data.input_tokens === null ||
    data.output_tokens === null
  )
    return event;
  return {
    ...event,
    data: {
      ...data,
      cost: cost.costUsd,
      costSource: "dsh-cost-meter",
      costBasis: "Plugin API estimate · dsh-cost-meter (USD)",
      costRows: cost.rows,
      responseModel: cost.model,
    },
  };
}
