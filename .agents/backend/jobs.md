# Jobs

`src/server/jobs/workflow.ts` selects routes and owns job state and preparation
checkpoints. `queue.ts` owns concurrency. `store.ts` owns durable state and activity.
Keep task execution in its domain workflow or a dedicated subworkflow.

- Give each distinct task a separate implementation owner and connect it from the
  owning workflow. Do not put task execution in queue or transport code.
- Put shared request/result/state contracts in `src/shared/` when the server, UI or
  MCP consumes them. Validate external results before changing durable state.
- Preserve project/job/invocation attribution across queue boundaries and retries.
  Follow [Governance](governance.md) for every model call.
- Propagate cancellation through queued and active work. Persist valid completed
  artifacts and checkpoints; unvisited or cancelled work is not complete.
- Validate checkpoint/cache inputs before reuse. Resume valid saved progress and
  prevent duplicate active submissions. Report the concrete failure.
- Preserve original requirements and settings across planning, generation, review
  and recovery. Never silently switch renderer, model or selected styles.

Test the registered route with fixtures: scheduling, state changes, retry/resume,
cancellation, duplicate prevention and model activity. Read
[subworkflows](subworkflows.md) before adding an execution stage.
