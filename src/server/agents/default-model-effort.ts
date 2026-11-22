import type { ModelEffort } from "../../shared/model-effort";

export function defaultModelCallEffort({
  taskEffort,
  providerDefaultEffort,
}: {
  taskEffort?: ModelEffort;
  providerDefaultEffort?: ModelEffort;
}): ModelEffort | undefined {
  return taskEffort ?? providerDefaultEffort;
}
