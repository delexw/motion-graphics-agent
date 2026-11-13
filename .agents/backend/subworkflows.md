# Subworkflows

`src/server/jobs/subworkflows/` contains task execution within a job. Read its
[ownership and routing guide](../../src/server/jobs/subworkflows/README.md).

- Put each distinct subworkflow in its own module or class. Use a folder when its
  prompt, handoff, review and recovery logic need separate files.
- Keep routing and job-level checkpoints in the owning workflow. Connect the new
  subworkflow there explicitly; creating a file alone is not registration.
- Give its entry point typed inputs, validated outputs, a cancellation signal and
  scoped progress callbacks. Reuse shared contracts at their lowest common owner.
- Keep task-specific prompts beside the task. Supply context explicitly to fresh
  sessions and retries; do not depend on an earlier hidden conversation.
- Persist validated handoffs and completion evidence before downstream stages use
  them. A model PASS does not prove an artifact is valid or a task is complete.
- Keep repair policies scoped to the task. A local defect does not authorize a
  global rewrite, extra generation tasks or unbounded retries.
- Record nested model calls through [Governance](governance.md), including failed
  reviews and retries. Keep workflow tracking out of transport clients.

Test caller-to-subworkflow routing, handoff validation, cancellation, failure and
resume behavior with fixtures. Follow [jobs](jobs.md) for durable lifecycle rules.
