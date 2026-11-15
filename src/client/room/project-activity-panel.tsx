import type { Run } from "../../shared/contracts";
import { RoomActivity, RoomActivityContextDetail } from "./room-activity";
import type { RoomActivityContext } from "./project-stages";
import { ActivityBranchView } from "./activity-branch";

/** Parents and descendants use the same lazy branch loader and collapse disposal. */
export function ProjectActivityPanel({
  run,
  onRetry,
  contexts,
}: {
  run: Run;
  onRetry?: (jobId?: string) => void | Promise<void>;
  contexts?: RoomActivityContext[];
}) {
  return (
    <div className="project-activity-panel">
      <RoomActivity
        run={run}
        events={[]}
        contexts={contexts}
        renderContext={(context) =>
          context.checkpoints.length ? (
            <RoomActivityContextDetail run={run} context={context} onRetry={onRetry} />
          ) : (
            <ActivityBranchView
              run={run}
              jobId={run.jobs.some((job) => job.id === context.key) ? context.key : ""}
              onRetry={onRetry}
            />
          )
        }
      />
    </div>
  );
}
