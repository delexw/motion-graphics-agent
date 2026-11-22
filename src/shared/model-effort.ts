export const defaultDynamicModelEffort = false;

export function usesDynamicModelEffort(settings: { dynamicModelEffort?: boolean }): boolean {
  return settings.dynamicModelEffort ?? defaultDynamicModelEffort;
}

export const effortLevelLabels = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Maximum",
  ultra: "Ultra",
} as const;
export type ModelEffort = keyof typeof effortLevelLabels;

export const effortTaskLabels = {
  brief: "Brief and supporting text",
  planning: "Planning and direction proposals",
  build: "Building and refining",
  script: "Timed script writing",
  review: "Result review",
  capture: "Chapter capture",
  repair: "Main-model correction",
  quickRepair: "First-pass correction",
} as const;
export type EffortTask = keyof typeof effortTaskLabels;

export interface ModelEffortDecision {
  id: string;
  selected?: ModelEffort;
}
