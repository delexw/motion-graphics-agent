import type { EffortTask, ModelEffort } from "../../shared/model-effort";

const defaultTaskEffort: Partial<Record<EffortTask, ModelEffort>> = {
  review: "medium",
};

export function defaultModelCallEffort({
  taskEffort,
  providerDefaultEffort,
  effortTask,
}: {
  taskEffort?: ModelEffort;
  providerDefaultEffort?: ModelEffort;
  effortTask?: EffortTask;
}): ModelEffort | undefined {
  return (
    taskEffort ?? providerDefaultEffort ?? (effortTask ? defaultTaskEffort[effortTask] : undefined)
  );
}
