import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { stringify } from "yaml";
import { prepareProjectRuntime } from "../../runtime/project-files";
import type { AgentExecutionOptions } from "../agent";

let policyBundle: Promise<string> | undefined;
export async function prepareDeepSeekConfiguration(options: AgentExecutionOptions) {
  const files = prepareProjectRuntime(options.workspace, "agent");
  const home = path.join(files.root, "deepseek");
  await mkdir(home, { recursive: true, mode: 0o700 });
  policyBundle ??= build({
    entryPoints: [fileURLToPath(new URL("./runtime-plugin.ts", import.meta.url))],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  })
    .then((result) => result.outputFiles[0].text)
    .catch((error) => {
      policyBundle = undefined;
      throw error;
    });
  const invocationDirectory = path.join(home, "invocations", randomUUID());
  await mkdir(invocationDirectory, { recursive: true, mode: 0o700 });
  const plugin = path.join(invocationDirectory, "kiteva-policy.mjs");
  await writeFile(plugin, await policyBundle, { mode: 0o600, signal: options.signal });
  const costFile = path.join(invocationDirectory, "costs.json");
  const costWrapper = path.join(invocationDirectory, "cost-meter.mjs");
  const require = createRequire(import.meta.url);
  await writeFile(
    costWrapper,
    `import { Console } from 'node:console';
globalThis.console = new Console({ stdout: process.stderr, stderr: process.stderr });
const plugin = await import(${JSON.stringify(pathToFileURL(require.resolve("dsh-cost-meter")).href)});
export const name = 'kiteva-cost-meter';
export const apply = plugin.apply;
`,
    { mode: 0o600, signal: options.signal },
  );
  const servers = options.textOnly ? {} : options.capabilityServers || {};
  const disabled = [
    "tool-plugin-manager",
    "tool-web",
    "tool-subagent",
    "tool-subagent-fork",
    "tool-subagent-control",
    "tool-agent-team",
    "tool-schedule",
    "session-title-llm",
    "session-log-deepseek",
    "session-telemetry-otel",
    "plugin-package-inventory-deepseek",
    "agent-instructions",
  ];
  const patch = [
    ...disabled.map((id) => ({ id, disabled: true })),
    {
      id: "sandbox-policy",
      config: {
        mode: options.readOnly || options.textOnly ? "read-only" : "workspace-write",
        workspaceRoot: options.workspace,
        additionalWritableRoots: [
          ...(!options.readOnly && !options.textOnly ? [path.resolve(options.workspace)] : []),
          files.root,
        ],
      },
    },
    { id: "approval", config: { policy: "never" } },
    {
      id: "skill-filesystem",
      config: {
        includeDefaultRoots: false,
        customSkillDirs: [path.join(options.workspace, ".agents", "skills")],
        watch: false,
      },
    },
    {
      insert: [
        { id: "kiteva-cost-meter", name: costWrapper },
        ...Object.entries(servers).map(([serverName, server]) => ({
          id: `kiteva-mcp-${serverName}`,
          name: "@deepseek-ai/dsh-mcp-client",
          config: {
            serverName,
            transport: "stdio",
            command: server.command,
            args: server.args,
            env: server.env,
            cwd: options.workspace,
            toolCallTimeoutMs: (server.toolTimeoutSeconds || 60) * 1000,
            failOnStartupError: true,
          },
        })),
        {
          id: "kiteva-policy",
          name: plugin,
          config: {
            textOnly: Boolean(options.textOnly),
            readOnly: Boolean(options.readOnly),
            systemPrompt: options.systemPrompt,
            costFile,
            allowedMcpTools: Object.entries(servers).flatMap(([name, server]) =>
              server.enabledTools.map((tool) => `mcp__${name}__${tool}`),
            ),
          },
        },
      ],
    },
  ];
  const patchFile = path.join(invocationDirectory, "kiteva.patch.yml");
  await writeFile(patchFile, stringify(patch), { mode: 0o600, signal: options.signal });
  return { home, patchFile, costFile };
}
