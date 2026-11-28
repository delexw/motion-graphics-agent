import { afterEach, expect, it, vi } from "vitest";
import { access, mkdtemp, readdir, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { loadCatalog } from "../../src/server/catalog/catalog";
import {
  styleSummarySource,
  summarizeStyle,
  summaryModels,
  styleSummaryCacheFolder,
} from "../../src/server/catalog/style-summaries";
import { appRoot } from "../../src/server/runtime/config";
import type { AgentTurnOptions } from "../../src/server/agents/agent";
import { prepareBundledSkills } from "../../src/server/agents/bundled-skills";
import { prepareAgyCliConfiguration } from "../../src/server/agents/gemini/configuration";
import type { agentTurn } from "../../src/server/agents/providers";
import { deferred } from "../fixtures/deferred";
import { skillInstallationFixture } from "../fixtures/installed-skill";

const folders: string[] = [];
it("keeps the shared extraction cache in persistent codebase assets", () => {
  expect(styleSummaryCacheFolder).toBe(path.join(appRoot, "assets", "style-summaries"));
});
afterEach(async () => {
  await Promise.all(folders.splice(0).map((f) => rm(f, { recursive: true, force: true })));
});
async function cache() {
  const folder = await mkdtemp(path.join(os.tmpdir(), "style-summary-test-"));
  folders.push(folder);
  return folder;
}
const summary = {
  styleId: "style-001",
  name: "Example",
  visualIdentity: "Grid",
  decisionGuidance:
    "Identity: Structured grid. Advantages: clear comparisons. Disadvantages: restrained expression. Combination fit: ordered layouts. Visual constraints: preserve hierarchy.",
  suitableUses: "Clarity",
  limitations: "Restrained",
  palette: "Original",
  motionAndInteraction: "Assembly",
  audio: "Flexible",
  assetRequirements: "Code-created",
  combinations: "Optional",
  productionApproach: "Illustration-led",
};

it("sends all original metadata and referenced motion information, without truncation", async () => {
  const catalog = await loadCatalog();
  catalog.originalStyles[0].extraOriginalField = "x".repeat(14000) + "END_OF_ORIGINAL";
  const source = styleSummarySource(catalog, "style-001");
  expect(source.style).toEqual(catalog.originalStyles[0]);
  const generate = vi.fn(async () => ({ value: summary })) as unknown as typeof agentTurn;
  const signal = new AbortController().signal;
  await summarizeStyle(source, "claude", signal, await cache(), generate);
  expect(generate).toHaveBeenCalledWith(
    expect.objectContaining({
      model: summaryModels.claude,
      promptContext: { originalSource: source },
      readOnly: true,
      signal,
      executionTimeoutMs: 180_000,
      prompt: expect.stringContaining("Read the complete originalSource"),
    }),
  );
  const options = vi.mocked(generate).mock.calls[0][0];
  expect(options.prompt).toContain("Advantages; Disadvantages; Combination fit");
  expect(options.prompt).toContain("Exclude library inventories");
  const { decisionGuidance: _omitted, ...incomplete } = summary;
  expect(options.schema.safeParse(incomplete).success).toBe(false);
});

it.each([
  ["claude", "style-001"],
  ["codex", "style-001"],
  ["gemini", "style-166"],
] as const)(
  "shares a %s-authored summary for %s and refreshes it after a guide edit",
  async (provider, styleId) => {
    const catalog = await loadCatalog();
    const source = styleSummarySource(catalog, styleId);
    const folder = await cache();
    const generate = vi.fn(async () => ({
      value: { ...summary, styleId },
    })) as unknown as typeof agentTurn;
    const events = vi.fn();
    await summarizeStyle(source, provider, new AbortController().signal, folder, generate);
    await summarizeStyle(
      source,
      provider === "claude" ? "codex" : "claude",
      new AbortController().signal,
      folder,
      generate,
      events,
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ provider, model: summaryModels[provider] }),
    );
    expect(events).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "summary_cache",
        data: { provider, model: summaryModels[provider], styleId },
      }),
    );
    const guide = catalog.styles.find((style) => style.id === styleId)!.executable_prompt_template;
    const revisedGuide = guide.replace(
      /^> .+/,
      "> Use a tight grid and keep labels readable during each move.",
    );
    const revisedSource = {
      ...source,
      style: { ...source.style, executable_prompt_template: revisedGuide },
    };
    await summarizeStyle(revisedSource, provider, new AbortController().signal, folder, generate);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenLastCalledWith(
      expect.objectContaining({ promptContext: { originalSource: revisedSource } }),
    );
  },
);

it.each(["claude", "codex"] as const)(
  "uses %s's lightweight model on a cache miss",
  async (provider) => {
    const generate = vi.fn(async () => ({ value: summary })) as unknown as typeof agentTurn;
    await summarizeStyle(
      styleSummarySource(await loadCatalog(), "style-001"),
      provider,
      new AbortController().signal,
      await cache(),
      generate,
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        provider,
        model: provider === "codex" ? "gpt-6-luna" : "claude-haiku-5-5",
      }),
    );
  },
);

it("isolates concurrent Gemini style summaries with the CLI hooks active", async () => {
  const catalog = await loadCatalog();
  const folder = await cache();
  const { root } = await skillInstallationFixture();
  folders.push(root);
  const signal = new AbortController().signal;
  const firstReady = deferred();
  const releaseFirst = deferred();
  const hooksFile = (workspace: string) => path.join(workspace, ".agents", "hooks.json");

  // Configuration only. The fixture executable is never launched.
  vi.stubEnv("VIDEO_GEMINI_AGY_BIN", process.execPath);
  const firstGenerate = vi.fn(async (options: AgentTurnOptions<unknown>) => {
    expect(path.dirname(options.workspace)).toBe(os.tmpdir());
    await prepareBundledSkills(options.workspace, options.signal, root);
    const configuration = await prepareAgyCliConfiguration({
      ...options,
      model: summaryModels.gemini,
      jsonSchema: { type: "object" },
      systemPrompt: "",
    });
    try {
      firstReady.resolve();
      await releaseFirst.promise;
      return { value: summary };
    } finally {
      await configuration.cleanup();
    }
  });
  const first = summarizeStyle(
    styleSummarySource(catalog, "style-001"),
    "gemini",
    signal,
    folder,
    firstGenerate as typeof agentTurn,
  );

  try {
    await Promise.race([
      firstReady.promise,
      first.then(() => {
        throw Error("First summary ended before its hooks could be checked");
      }),
    ]);
    const firstWorkspace = firstGenerate.mock.calls[0][0].workspace;
    const firstHooks = await readFile(hooksFile(firstWorkspace), "utf8");
    await expect(prepareBundledSkills(firstWorkspace, signal, root)).rejects.toThrow(
      "Unexpected bundled plugin component: hooks.json",
    );
    const secondSummary = { ...summary, styleId: "style-002" };
    const secondGenerate = vi.fn(async (options: AgentTurnOptions<unknown>) => {
      await prepareBundledSkills(options.workspace, options.signal, root);
      return { value: secondSummary };
    });
    const secondSource = styleSummarySource(catalog, "style-002");
    await expect(
      summarizeStyle(secondSource, "gemini", signal, folder, secondGenerate as typeof agentTurn),
    ).resolves.toEqual(secondSummary);
    const secondWorkspace = secondGenerate.mock.calls[0][0].workspace;
    expect(secondWorkspace).not.toBe(firstWorkspace);
    await expect(access(secondWorkspace)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(hooksFile(firstWorkspace), "utf8")).toBe(firstHooks);
  } finally {
    releaseFirst.resolve();
    vi.unstubAllEnvs();
    await first;
  }
  await expect(access(firstGenerate.mock.calls[0][0].workspace)).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it.each(["claude", "codex"] as const)(
  "migrates both legacy layouts authored by %s for either provider",
  async (provider) => {
    const source = styleSummarySource(await loadCatalog(), "style-001");
    const model = summaryModels[provider];
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          revision: 3,
          model,
          source,
        }),
      )
      .digest("hex");
    for (const isolated of [false, true]) {
      const folder = await cache();
      const directory = path.join(folder, provider, ...(isolated ? ["models"] : []));
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, `style-001-${hash}.json`),
        JSON.stringify(isolated ? { summary, provider, model } : summary),
      );
      const generate = vi.fn(async () => {
        throw Error("Must reuse");
      }) as unknown as typeof agentTurn;
      const events = vi.fn();
      await expect(
        summarizeStyle(
          source,
          provider === "claude" ? "codex" : "claude",
          new AbortController().signal,
          folder,
          generate,
          events,
        ),
      ).resolves.toEqual(summary);
      await rm(path.join(folder, provider), { recursive: true });
      await expect(
        summarizeStyle(source, provider, new AbortController().signal, folder, generate),
      ).resolves.toEqual(summary);
      expect(generate).not.toHaveBeenCalled();
      expect(events).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "summary_cache",
          data: { provider, model, styleId: "style-001" },
        }),
      );
    }
  },
);

it("does not cache failures or accept summaries for another style", async () => {
  const source = styleSummarySource(await loadCatalog(), "style-001"),
    folder = await cache(),
    signal = new AbortController().signal;
  const generate = vi
    .fn()
    .mockRejectedValueOnce(Error("Model unavailable"))
    .mockResolvedValueOnce({ value: { ...summary, styleId: "style-002" } })
    .mockResolvedValue({ value: summary }) as unknown as typeof agentTurn;
  await expect(summarizeStyle(source, "claude", signal, folder, generate)).rejects.toThrow(
    "Model unavailable",
  );
  await expect(summarizeStyle(source, "claude", signal, folder, generate)).rejects.toThrow(
    "different Motion Graphic",
  );
  await expect(summarizeStyle(source, "claude", signal, folder, generate)).resolves.toEqual(
    summary,
  );
  for (const [{ workspace }] of vi.mocked(generate).mock.calls) {
    await expect(access(workspace)).rejects.toMatchObject({ code: "ENOENT" });
  }
  const controller = new AbortController();
  controller.abort();
  await expect(
    summarizeStyle(source, "claude", controller.signal, folder, generate),
  ).rejects.toThrow();
});

it("removes an active workspace and skips the cache when a summary is cancelled", async () => {
  const source = styleSummarySource(await loadCatalog(), "style-001");
  const controller = new AbortController();
  const folder = await cache();
  const generate = vi.fn(async ({ workspace, signal }: AgentTurnOptions<unknown>) => {
    await writeFile(path.join(workspace, "pending.json"), "{}");
    controller.abort(Error("Summary cancelled"));
    signal.throwIfAborted();
    return { value: summary };
  });
  await expect(
    summarizeStyle(source, "gemini", controller.signal, folder, generate as typeof agentTurn),
  ).rejects.toThrow("Summary cancelled");
  await expect(access(generate.mock.calls[0][0].workspace)).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(await readdir(path.join(folder, "shared"))).toEqual([]);
});

it("reuses source-matched legacy summaries without forcing a catalog-wide regeneration", async () => {
  const source = styleSummarySource(await loadCatalog(), "style-001");
  const folder = await cache();
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        revision: 3,
        source,
      }),
    )
    .digest("hex");
  await mkdir(path.join(folder, "shared"), { recursive: true });
  const { decisionGuidance: _old, ...oldSummary } = summary;
  await writeFile(
    path.join(folder, "shared", `style-001-${hash}.json`),
    JSON.stringify({ summary: oldSummary, model: summaryModels.claude, provider: "claude" }),
  );
  const generate = vi.fn(async () => ({ value: summary })) as unknown as typeof agentTurn;
  expect(
    await summarizeStyle(source, "claude", new AbortController().signal, folder, generate),
  ).toEqual(oldSummary);
  expect(generate).not.toHaveBeenCalled();
});
