import { afterEach, expect, it, vi } from "vitest";
import type { GenerationJob, Run } from "../src/shared/contracts";
import type { Phase } from "../src/shared/domains/common";

function job(phase: Phase, kind = "preview"): GenerationJob {
  return { id: `${kind}-${Math.random()}`, kind, phase } as GenerationJob;
}

function project(id: string, jobs: GenerationJob[], extra: Partial<Run> = {}): Run {
  return {
    id,
    phase: "generating",
    jobs,
    request: { instructions: "A cartoon fire truck for kids" },
    ...extra,
  } as Run;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("reports a project once, when its last preview direction finishes", async () => {
  const { createPreviewCompletionTracker } = await import("../src/client/lib/preview-notification");
  const track = createPreviewCompletionTracker();
  expect(track([project("a", [job("ready"), job("generating"), job("queued")])])).toEqual([]);
  expect(track([project("a", [job("ready"), job("ready"), job("generating")])])).toEqual([]);
  const done = project("a", [job("ready"), job("failed"), job("ready")], { phase: "ready" });
  expect(track([done])).toEqual([done]);
  expect(track([done])).toEqual([]);
});

it("ignores projects already finished on first sight, cancelled runs, picked winners and full builds", async () => {
  const { createPreviewCompletionTracker } = await import("../src/client/lib/preview-notification");
  const track = createPreviewCompletionTracker();
  expect(track([project("seen-done", [job("ready")], { phase: "ready" })])).toEqual([]);

  const pending = [
    project("cancelled", [job("generating")]),
    project("winner", [job("generating")]),
    project("full", [job("ready"), job("generating", "full")]),
  ];
  expect(track(pending)).toEqual([]);
  expect(
    track([
      project("cancelled", [job("cancelled")], { phase: "cancelled" }),
      project("winner", [job("ready")], { winnerId: "candidate" }),
      project("full", [job("ready"), job("ready", "full")], { phase: "ready" }),
    ]),
  ).toEqual([]);
});

it("plays a chime after a user gesture and shows a notification that opens the project", async () => {
  const oscillators: { start: ReturnType<typeof vi.fn> }[] = [];
  const node = () => ({ connect: vi.fn((next) => next) });
  class FakeAudioContext {
    currentTime = 0;
    destination = {};
    resume = vi.fn(async () => {});
    createOscillator() {
      const oscillator = {
        ...node(),
        type: "",
        frequency: { setValueAtTime: vi.fn() },
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    }
    createGain() {
      return {
        ...node(),
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      };
    }
  }
  const shown: { title: string; options: NotificationOptions; onclick?: () => void }[] = [];
  class FakeNotification {
    static permission: NotificationPermission = "default";
    static requestPermission = vi.fn(async () => {
      FakeNotification.permission = "granted";
      return "granted" as const;
    });
    onclick?: () => void;
    close = vi.fn();
    constructor(title: string, options: NotificationOptions) {
      shown.push(Object.assign(this, { title, options }) as never);
    }
  }
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("Notification", FakeNotification);
  vi.stubGlobal("window", { focus: vi.fn() });
  const storage = memoryStorage();
  vi.stubGlobal("localStorage", storage);
  const {
    notifyPreviewsFinished,
    previewNotificationPreference,
    previewNotificationStorageKey,
    primePreviewNotifications,
  } = await import("../src/client/lib/preview-notification");

  previewNotificationPreference.load();
  expect(previewNotificationPreference.get()).toBe(false);
  primePreviewNotifications();
  notifyPreviewsFinished(project("off", [job("ready")]), vi.fn());
  expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  expect(oscillators).toHaveLength(0);
  expect(shown).toHaveLength(0);

  const changed = vi.fn();
  previewNotificationPreference.subscribe(changed);
  previewNotificationPreference.set(true);
  await Promise.resolve();
  expect(changed).toHaveBeenCalledOnce();
  expect(storage.getItem(previewNotificationStorageKey)).toBe("on");
  expect(FakeNotification.requestPermission).toHaveBeenCalledOnce();

  const open = vi.fn();
  notifyPreviewsFinished(project("p1", [job("ready"), job("failed"), job("ready")]), open);
  expect(oscillators).toHaveLength(2);
  for (const oscillator of oscillators) expect(oscillator.start).toHaveBeenCalledOnce();
  expect(shown).toHaveLength(1);
  expect(shown[0].title).toBe("Preview directions finished");
  expect(shown[0].options.body).toBe("A cartoon fire truck for kids: 2 of 3 directions ready");
  shown[0].onclick?.();
  expect(open).toHaveBeenCalledOnce();

  previewNotificationPreference.set(false);
  expect(storage.getItem(previewNotificationStorageKey)).toBe("off");
  notifyPreviewsFinished(project("p1-again", [job("ready")]), vi.fn());
  expect(oscillators).toHaveLength(2);
  expect(shown).toHaveLength(1);
});

it("restores a saved choice and falls back to off when browser storage is unavailable", async () => {
  const storage = memoryStorage();
  const { previewNotificationPreference, previewNotificationStorageKey } =
    await import("../src/client/lib/preview-notification");
  storage.setItem(previewNotificationStorageKey, "on");
  vi.stubGlobal("localStorage", storage);
  previewNotificationPreference.load();
  expect(previewNotificationPreference.get()).toBe(true);

  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw Error("blocked");
    },
    setItem: () => {
      throw Error("blocked");
    },
  });
  previewNotificationPreference.load();
  expect(previewNotificationPreference.get()).toBe(false);
  expect(() => previewNotificationPreference.set(true)).not.toThrow();
  expect(previewNotificationPreference.get()).toBe(true);
});

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

it("stays silent and shows nothing without a user gesture or notification permission, even when on", async () => {
  const constructed = vi.fn();
  vi.stubGlobal(
    "Notification",
    class {
      static permission = "denied";
      constructor() {
        constructed();
      }
    },
  );
  vi.stubGlobal("localStorage", memoryStorage());
  const { notifyPreviewsFinished, previewNotificationPreference } =
    await import("../src/client/lib/preview-notification");
  previewNotificationPreference.set(true);
  expect(() => notifyPreviewsFinished(project("p2", [job("ready")]), vi.fn())).not.toThrow();
  expect(constructed).not.toHaveBeenCalled();
});
