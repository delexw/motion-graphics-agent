import { AsyncLocalStorage } from "node:async_hooks";
import type { CreativeRequest } from "../../shared/contracts";
import {
  usesDynamicModelEffort,
  type EffortTask,
  type ModelEffort,
} from "../../shared/model-effort";
import { dynamicModelCallEffort } from "../jev/strategies/model-effort";
import type { ProviderEvent } from "./agent";
import { defaultModelCallEffort } from "./default-model-effort";

type ProjectModelContext = {
  request: CreativeRequest;
  onEffortEvent: (event: ProviderEvent) => void;
};
const project = new AsyncLocalStorage<ProjectModelContext>();

export function withProjectModelEffort<T>(context: ProjectModelContext, work: () => T): T {
  return project.run(context, work);
}

type ProjectModelCall = Omit<
  Parameters<typeof dynamicModelCallEffort>[0],
  "request" | "task" | "onEvent"
> & { effortTask?: EffortTask };

export async function resolveProjectCallEffort({
  taskEffort,
  providerDefaultEffort,
  effortTask,
  ...call
}: ProjectModelCall & Parameters<typeof defaultModelCallEffort>[0]): Promise<{
  effort: ModelEffort | undefined;
  decisionId?: string;
}> {
  const defaults = { taskEffort, providerDefaultEffort };
  const context = project.getStore();
  const request = context?.request;
  if (!context || !request || !usesDynamicModelEffort(request)) {
    return { effort: defaultModelCallEffort(defaults) };
  }

  const decision = await dynamicModelCallEffort({
    ...call,
    request,
    task: effortTask,
    onEvent: context.onEffortEvent,
  });
  return {
    effort: decision?.selected ?? defaultModelCallEffort(defaults),
    decisionId: decision?.id,
  };
}
