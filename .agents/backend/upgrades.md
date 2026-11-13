# Upgrade guidance

Read [Dependency upgrade lifecycle](../../docs/dependency-upgrades.md) before adding
or changing a third-party MCP, executable, SDK or bundled resource. That document owns
update triggers, managed versus external installations, verification, immutable
versions, fallback and running-job protection. Update it when behavior changes;
do not copy its procedures or version tables into new agent guidance.

Also read [SDK security](sdk-security.md), [tool boundaries](tools.md) and
[bundled skills](bundled-skills.md) for the integration you change. Register each
updater at its owning lifecycle entry point and test that caller with local fixtures.
Never make a generation tool silently install or upgrade its own dependencies.
