import { expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  installDeepSeekCostBridge,
  readDeepSeekCosts,
  attachDeepSeekCost,
  type DeepSeekCostBridgeContext,
} from "../src/server/agents/deepseek/cost-meter";

it("uses the installed plugin's per-call results without calculating or adding session totals", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cost-plugin-"));
  const file = path.join(root, "costs.json");
  const on = vi.fn<DeepSeekCostBridgeContext["on"]>();
  const effect = vi.fn<DeepSeekCostBridgeContext["effect"]>();
  const call = {
    logSeq: 4,
    model: "deepseek-flash",
    provider: "deepseek-official",
    priced: true,
    plan: false,
    cost: 0.000012,
    apiCost: 0.000012,
    rows: [{ bucket: "input", tokens: 20, rate: 0.3, cost: 0.000006, priced: true, plan: false }],
  };
  const costMeter = {
    updateConfig: vi.fn().mockResolvedValue(undefined),
    getTurnCost: vi.fn().mockResolvedValue({
      cost: 999,
      calls: [
        call,
        { ...call, logSeq: 5, model: "unknown-model" },
        { ...call, logSeq: 6, plan: true },
      ],
    }),
  };
  try {
    await installDeepSeekCostBridge({ on, effect, costMeter }, file);
    expect(costMeter.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: "USD",
        exchangeRateAuto: false,
        balance: { display: "off", reconcile: false },
        goQuota: { enabled: false },
      }),
    );
    const listener = on.mock.calls[0][1];
    const session = { id: "fixture-session" };
    listener(session, { type: "turn/start", seq: 1, data: { turn: 1 } });
    listener(session, { type: "turn/end", seq: 8, data: { turn: 1 } });
    await effect.mock.calls[0][0]()();
    expect(costMeter.getTurnCost).toHaveBeenCalledWith("fixture-session", 1, 8, "USD");
    const records = await readDeepSeekCosts(file);
    const event = {
      type: "usage",
      message: "usage",
      data: { usageId: "deepseek:fixture-session:4", input_tokens: 20, output_tokens: 7 },
    };
    expect(attachDeepSeekCost(event, records).data).toMatchObject({
      cost: 0.000012,
      costSource: "dsh-cost-meter",
    });
    expect(JSON.stringify(attachDeepSeekCost(event, records))).not.toContain("999");
    expect(
      attachDeepSeekCost(
        { ...event, data: { ...event.data, usageId: "deepseek:fixture-session:5" } },
        records,
      ).data,
    ).not.toHaveProperty("cost");
    expect(
      attachDeepSeekCost({ ...event, data: { ...event.data, input_tokens: null } }, records).data,
    ).not.toHaveProperty("cost");
    expect(JSON.parse(await readFile(file, "utf8")).source).toBe("dsh-cost-meter");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("leaves cost unknown for a missing record or plugin failure", async () => {
  expect((await readDeepSeekCosts(undefined)).size).toBe(0);
  const on = vi.fn<DeepSeekCostBridgeContext["on"]>();
  const effect = vi.fn<DeepSeekCostBridgeContext["effect"]>();
  const costMeter = {
    updateConfig: vi.fn().mockResolvedValue(undefined),
    getTurnCost: vi.fn().mockRejectedValue(Error("fixture failure")),
  };
  await installDeepSeekCostBridge({ on, effect, costMeter }, "/unused-fixture-path");
  const listener = on.mock.calls[0][1];
  listener({ id: "s" }, { type: "turn/start", seq: 1, data: { turn: 1 } });
  listener({ id: "s" }, { type: "turn/end", seq: 2, data: { turn: 1 } });
  await expect(effect.mock.calls[0][0]()()).resolves.toBeUndefined();
});
it("rejects malformed plugin cost data instead of showing a false zero", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cost-plugin-invalid-"));
  try {
    const file = path.join(root, "costs.json");
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        source: "dsh-cost-meter",
        records: [{ usageId: "s:1", costUsd: -1 }],
      }),
    );
    await expect(readDeepSeekCosts(file)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
