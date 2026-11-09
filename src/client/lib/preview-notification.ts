import { terminalPhases, type Run } from "../../shared/contracts";
import { projectName } from "../../shared/project-name";
import { translateUi } from "../i18n";

function previewJobs(run: Run) {
  return run.jobs.filter((job) => job.kind === "preview");
}

function previewsPending(run: Run) {
  return previewJobs(run).some((job) => !terminalPhases.has(job.phase));
}

export function previewSummary(run: Run) {
  const previews = previewJobs(run);
  return {
    name: projectName(run),
    ready: previews.filter((job) => job.phase === "ready").length,
    total: previews.length,
  };
}

export function createPreviewCompletionTracker() {
  const pending = new Map<string, boolean>();
  return (runs: Run[]) => {
    const finished: Run[] = [];
    for (const run of runs) {
      const stillPending = previewsPending(run);
      const wasPending = pending.get(run.id) ?? false;
      pending.set(run.id, stillPending);
      if (!wasPending || stillPending || run.winnerId) continue;
      if (run.phase === "cancelled" || run.phase === "interrupted") continue;
      finished.push(run);
    }
    return finished;
  };
}

export const previewNotificationStorageKey = "kiteva.preview-notifications";
let enabled = false;
const listeners = new Set<() => void>();

export const previewNotificationPreference = {
  get: () => enabled,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  load() {
    try {
      enabled = localStorage.getItem(previewNotificationStorageKey) === "on";
    } catch {
      enabled = false;
    }
    for (const listener of listeners) listener();
  },
  set(next: boolean) {
    enabled = next;
    try {
      localStorage.setItem(previewNotificationStorageKey, next ? "on" : "off");
    } catch {
      /* The choice still applies for this page. */
    }
    if (next) primePreviewNotifications();
    for (const listener of listeners) listener();
  },
};

let audioContext: AudioContext | undefined;

export function primePreviewNotifications() {
  if (!enabled) return;
  if (typeof AudioContext !== "undefined") {
    audioContext ??= new AudioContext();
    void audioContext.resume().catch(() => {});
  }
  if (typeof Notification !== "undefined" && Notification.permission === "default")
    void Notification.requestPermission().catch(() => {});
}

function playChime() {
  if (!audioContext) return;
  const start = audioContext.currentTime;
  for (const [index, frequency] of [880, 1318.5].entries()) {
    const at = start + index * 0.18;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.65);
  }
}

export function notifyPreviewsFinished(run: Run, open: () => void) {
  if (!enabled) return;
  playChime();
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const { name, ready, total } = previewSummary(run);
  const notification = new Notification(translateUi("Preview directions finished"), {
    body: translateUi("{{value0}}: {{value1}} of {{value2}} directions ready", {
      value0: name,
      value1: ready,
      value2: total,
    }),
    tag: `kiteva-previews-${run.id}`,
  });
  notification.onclick = () => {
    window.focus();
    open();
    notification.close();
  };
}
