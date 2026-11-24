import { describe, expect, it } from "vitest";
import { defaultModelCallEffort } from "../../src/server/agents/default-model-effort";
import { resolveProjectCallEffort } from "../../src/server/agents/project-model-effort";

describe("review reasoning effort defaults", () => {
  it("defaults review turns to medium effort when no explicit or provider default is set", async () => {
    expect(defaultModelCallEffort({ effortTask: "review" })).toBe("medium");
    expect(defaultModelCallEffort({ effortTask: "review", taskEffort: "high" })).toBe("high");
    expect(defaultModelCallEffort({ effortTask: "review", providerDefaultEffort: "low" })).toBe(
      "low",
    );
    expect(defaultModelCallEffort({ effortTask: "build" })).toBeUndefined();
    expect(defaultModelCallEffort({})).toBeUndefined();

    const resolved = await resolveProjectCallEffort({
      model: "claude-opus-5-5",
      targetInvocationId: "review-fixture",
      effortTask: "review",
      prompt: "Review completed result",
      readOnly: true,
      signal: new AbortController().signal,
    });
    expect(resolved).toEqual({ effort: "medium" });
  });
});
