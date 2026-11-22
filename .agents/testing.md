# Test isolation

Each test must have its own isolated context. Create fresh mutable mocks,
workspaces, browser sessions and data stores for each case. Share immutable
inputs and fixture builders.

Set up every dependency the case needs. Restore changes to environment variables,
globals and files. Tests must pass alone and in a different order.
