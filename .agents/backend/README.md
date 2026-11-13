# Backend agent guidance

Read [Governance](governance.md) and [strategies and capabilities](strategies-and-capabilities.md)
before changing backend model calls or agent behavior. Also read each matching topic:

| Change                                       | Required guidance                   |
| -------------------------------------------- | ----------------------------------- |
| Job scheduling, state, retry or cancellation | [Jobs](jobs.md)                     |
| Execution within a larger workflow           | [Subworkflows](subworkflows.md)     |
| Dependency installation or upgrades          | [Upgrade lifecycle](upgrades.md)    |
| Skill installation, staging or selection     | [Bundled skills](bundled-skills.md) |
| SDK permissions or tool exposure             | [SDK security](sdk-security.md)     |
| Agent tools and their permissions            | [Tool boundaries](tools.md)         |

These are shared Claude/Codex development instructions, not production prompts
for generated projects. Source paths are relative to the repository root.
Read the current implementation before editing.
