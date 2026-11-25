import { randomUUID } from "node:crypto";
import { accessSync, constants, existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataRoot } from "../../runtime/paths";
import { credentialEnvironmentVariables } from "../../runtime/credential-environment";
import {
  defaultPython,
  nativeExecutable,
  systemEnvironment,
  userHome,
} from "../../runtime/platform";
import { projectRuntimeEnvironment, prepareProjectRuntime } from "../../runtime/project-files";
import type { AgentExecutionOptions } from "../agent";
import type { GeminiEffort } from "../model-effort-levels";
import { geminiCliEnabledTools, geminiEnabledTools } from "./policy";

export type GeminiTransport = "sdk" | "cli";

export interface GeminiSetupStatus {
  transport: GeminiTransport | null;
  ready: boolean;
}

export interface GeminiBridgeMcpServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  timeoutSeconds: number;
  enabledTools: string[];
}

export interface GeminiBridgeImage {
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  dataBase64: string;
}

export interface GeminiBridgePayload {
  workspace: string;
  model: string;
  prompt: string;
  systemPrompt: string;
  jsonSchema: Record<string, unknown>;
  textOnly: boolean;
  readOnly: boolean;
  enabledTools: string[];
  allowedMcpTools: string[];
  mcpServers: GeminiBridgeMcpServer[];
  skillsPaths: string[];
  images: GeminiBridgeImage[];
  appDataDir: string;
  saveDir: string;
  sessionId?: string;
  thinkingLevel?: GeminiEffort;
}

export interface GeminiRuntimeDirectories {
  root: string;
  home: string;
  appDataDir: string;
  saveDir: string;
  cacheDir: string;
}

export interface PreparedGeminiConfiguration {
  pythonBin: string;
  bridgeScript: string;
  env: Record<string, string>;
  payload: GeminiBridgePayload;
  directories: GeminiRuntimeDirectories;
}

export interface PreparedAgyCliConfiguration {
  agyBin: string;
  args: string[];
  env: Record<string, string>;
  directories: GeminiRuntimeDirectories;
  schemaFile: string;
  settingsFile: string;
  hookScript: string;
  cleanup: () => Promise<void>;
}

const imageMimeTypes: Record<string, GeminiBridgeImage["mimeType"]> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const geminiAllowedEnvKeys = [
  credentialEnvironmentVariables.geminiApiKey,
  credentialEnvironmentVariables.googleApiKey,
  "GOOGLE_GENAI_USE_VERTEXAI",
  "GOOGLE_GENAI_USE_ENTERPRISE",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_CLOUD_LOCATION",
  "GOOGLE_APPLICATION_CREDENTIALS",
  credentialEnvironmentVariables.anysearchApiKey,
] as const;

const agyAllowedEnvKeys = [credentialEnvironmentVariables.anysearchApiKey] as const;

function isTruthyFlag(value: string | undefined) {
  return ["1", "true", "yes"].includes((value || "").trim().toLowerCase());
}

function isExecutable(filePath: string) {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function hasGeminiApiCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env[credentialEnvironmentVariables.geminiApiKey]?.trim() ||
    env[credentialEnvironmentVariables.googleApiKey]?.trim() ||
    isTruthyFlag(env.GOOGLE_GENAI_USE_VERTEXAI) ||
    isTruthyFlag(env.GOOGLE_GENAI_USE_ENTERPRISE),
  );
}

export function resolveGeminiTransport(env: NodeJS.ProcessEnv = process.env): GeminiTransport {
  const configured = env.VIDEO_GEMINI_TRANSPORT?.trim().toLowerCase();
  if (!configured || configured === "auto") {
    return hasGeminiApiCredentials(env) ? "sdk" : "cli";
  }
  if (configured === "sdk" || configured === "cli") return configured;
  throw Error(`Invalid VIDEO_GEMINI_TRANSPORT "${configured}". Expected "auto", "sdk", or "cli".`);
}

export function geminiSetupStatus(env: NodeJS.ProcessEnv = process.env): GeminiSetupStatus {
  let transport: GeminiTransport | null;
  try {
    transport = resolveGeminiTransport(env);
  } catch {
    return { transport: null, ready: false };
  }
  return {
    transport,
    ready: transport === "sdk" ? hasGeminiApiCredentials(env) : Boolean(findAgyBinary(env)),
  };
}

export function findAgyBinary(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env.VIDEO_GEMINI_AGY_BIN?.trim();
  if (explicit) {
    if (explicit.includes("/") || explicit.includes("\\")) {
      return isExecutable(explicit) ? explicit : undefined;
    }
    const pathDirs = (env.PATH || "").split(path.delimiter).filter(Boolean);
    for (const dir of pathDirs) {
      const candidate = path.join(dir, explicit);
      if (isExecutable(candidate)) return candidate;
    }
    return undefined;
  }
  const binName = nativeExecutable("agy");
  const pathDirs = (env.PATH || "").split(path.delimiter).filter(Boolean);
  const candidates = [
    ...pathDirs.map((dir) => path.join(dir, binName)),
    path.join(userHome(env), ".local", "bin", binName),
  ];
  return candidates.find((candidate) => isExecutable(candidate));
}

export function resolveAgyBinary(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.VIDEO_GEMINI_AGY_BIN?.trim();
  const found = findAgyBinary(env);
  if (found) return found;
  if (explicit) {
    throw Error(
      `Antigravity CLI (agy) not found or not executable at "${explicit}". Install \`agy\` and sign in, or set GEMINI_API_KEY to use the Antigravity Python SDK.`,
    );
  }
  throw Error(
    "Antigravity CLI (`agy`) is not installed or not found on PATH. Install `agy` and sign in, or set GEMINI_API_KEY to use the Antigravity Python SDK.",
  );
}

export function managedGeminiVenvPython() {
  return path.join(
    dataRoot,
    "gemini-sdk-venv",
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "python.exe" : "python",
  );
}

export function resolveGeminiPython(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.VIDEO_GEMINI_PYTHON?.trim();
  if (configured) return configured;
  const managed = managedGeminiVenvPython();
  if (existsSync(managed)) return managed;
  return defaultPython();
}

export function resolveGeminiBridgeScript(): string {
  return fileURLToPath(new URL("./bridge.py", import.meta.url));
}

export function geminiChildEnvironment(
  workspace: string,
  directories: GeminiRuntimeDirectories,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const forwarded = Object.fromEntries(
    geminiAllowedEnvKeys.flatMap((key) => {
      const value = env[key];
      return value ? [[key, value]] : [];
    }),
  );
  return {
    ...systemEnvironment(env),
    ...projectRuntimeEnvironment(workspace, "agent"),
    HOME: directories.home,
    XDG_CONFIG_HOME: path.join(directories.home, ".config"),
    XDG_DATA_HOME: path.join(directories.home, ".local", "share"),
    XDG_CACHE_HOME: directories.cacheDir,
    PYTHONUNBUFFERED: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    ...forwarded,
  };
}

/**
 * Environment for the `agy` CLI subprocess: preserves host HOME so `agy` can
 * use the user's Antigravity OAuth login, keeps caches/temp project-local, and
 * strips all unrelated provider credentials and internal tokens.
 */
export function agyChildEnvironment(
  workspace: string,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const forwarded = Object.fromEntries(
    agyAllowedEnvKeys.flatMap((key) => {
      const value = env[key];
      return value ? [[key, value]] : [];
    }),
  );
  const projectRuntime = projectRuntimeEnvironment(workspace, "agent");
  const {
    HOME: _isolatedHome,
    USERPROFILE: _isolatedProfile,
    ...projectTempAndCaches
  } = projectRuntime;
  const base = Object.fromEntries(
    Object.entries(systemEnvironment(env)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  return {
    ...base,
    ...projectTempAndCaches,
    HOME: userHome(env),
    AGY_CLI_HIDE_LOGO: "1",
    ...forwarded,
  };
}

async function createGeminiDirectories(workspace: string): Promise<GeminiRuntimeDirectories> {
  const files = prepareProjectRuntime(workspace, "agent");
  const root = path.join(files.root, "gemini");
  const directories: GeminiRuntimeDirectories = {
    root,
    home: path.join(root, "home"),
    appDataDir: path.join(root, "app-data"),
    saveDir: path.join(root, "sessions"),
    cacheDir: path.join(root, "cache"),
  };
  await Promise.all([
    mkdir(directories.home, { recursive: true, mode: 0o700 }),
    mkdir(directories.appDataDir, { recursive: true, mode: 0o700 }),
    mkdir(directories.saveDir, { recursive: true, mode: 0o700 }),
    mkdir(directories.cacheDir, { recursive: true, mode: 0o700 }),
  ]);
  return directories;
}

export async function prepareGeminiConfiguration(
  options: AgentExecutionOptions,
  thinkingLevel?: GeminiEffort,
): Promise<PreparedGeminiConfiguration> {
  const directories = await createGeminiDirectories(options.workspace);

  const images: GeminiBridgeImage[] = [];
  for (const file of options.images || []) {
    options.signal.throwIfAborted();
    const extension = path.extname(file).toLowerCase();
    const mimeType = imageMimeTypes[extension];
    if (!mimeType) {
      throw Error("Gemini image input requires PNG, JPEG, WebP or GIF.");
    }
    const content = await readFile(file, { signal: options.signal });
    images.push({ mimeType, dataBase64: content.toString("base64") });
  }

  const textOnly = Boolean(options.textOnly);
  const readOnly = Boolean(options.readOnly);
  const servers = textOnly ? {} : options.capabilityServers || {};
  const mcpServers: GeminiBridgeMcpServer[] = Object.entries(servers).map(([name, server]) => ({
    name,
    command: server.command,
    args: server.args,
    env: server.env,
    timeoutSeconds: server.toolTimeoutSeconds || 60,
    enabledTools: server.enabledTools,
  }));
  const allowedMcpTools = mcpServers.flatMap((server) =>
    server.enabledTools.map((tool) => `mcp__${server.name}__${tool}`),
  );
  const skillsPaths = textOnly ? [] : [path.join(options.workspace, ".agents", "skills")];

  return {
    pythonBin: resolveGeminiPython(),
    bridgeScript: resolveGeminiBridgeScript(),
    env: geminiChildEnvironment(options.workspace, directories),
    directories,
    payload: {
      workspace: path.resolve(options.workspace),
      model: options.model,
      prompt: options.prompt,
      systemPrompt: options.systemPrompt,
      jsonSchema: options.jsonSchema,
      textOnly,
      readOnly,
      enabledTools: [...geminiEnabledTools({ textOnly, readOnly })],
      allowedMcpTools,
      mcpServers,
      skillsPaths,
      images,
      appDataDir: directories.appDataDir,
      saveDir: directories.saveDir,
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
      ...(thinkingLevel ? { thinkingLevel } : {}),
    },
  };
}

function buildAgyPreToolHookSource(config: {
  workspace: string;
  textOnly: boolean;
  enabledTools: readonly string[];
  allowedMcpTools: readonly string[];
  allowedMcpServers: readonly string[];
  mcpSchemaRoot: string;
}) {
  return `#!/usr/bin/env node
import { realpathSync } from "node:fs";
import path from "node:path";

const CONFIG = ${JSON.stringify(config)};
const READ_FILE_TOOLS = new Set(["read_file", "view_file"]);
const FILE_TOOLS = new Set(["list_directory", "search_directory", "find_file", "view_file", "create_file", "edit_file", "read_file", "write_file", "write_to_file", "list_dir", "find_by_name", "grep_search", "replace_file_content", "multi_replace_file_content", "view_file_outline", "view_code_item"]);
const PATH_KEYS = ["path", "Path", "file_path", "target_file", "TargetFile", "AbsolutePath", "directory", "directory_path", "DirectoryPath", "dir_path", "search_path", "SearchPath", "SearchDirectory", "root"];
const WRAPPERS = new Set(["timeout", "gtimeout", "env", "sudo", "exec", "command", "nohup", "nice", "time", "xvfb-run"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "pwsh", "powershell", "powershell.exe", "cmd", "cmd.exe"]);

function tokenize(cmd) {
  const out = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\\\" && quote === '"' && i + 1 < cmd.length) cur += cmd[++i];
      else cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (";|&()".includes(ch)) {
      if (cur) { out.push(cur); cur = ""; }
      if ((ch === "&" || ch === "|") && cmd[i + 1] === ch) { out.push(ch + ch); i++; }
      else out.push(ch);
      continue;
    }
    if (/\\s/.test(ch)) { if (cur) { out.push(cur); cur = ""; } continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function invokesBlender(cmd) {
  const tokens = tokenize(cmd);
  let executable = true;
  let shell = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if ([";", "&&", "||", "|", "&", "(", ")"].includes(token)) { executable = true; shell = false; continue; }
    if (shell && /^-(?:[a-z]*c|command)$|^\\/c$/i.test(token)) {
      if (typeof tokens[i + 1] === "string" && invokesBlender(tokens[i + 1])) return true;
    }
    if (!executable) continue;
    if (!token || token.startsWith("-") || /^\\d+$/.test(token) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
    const name = token.split(/[\\\\/]/).at(-1).toLowerCase();
    if (/^blender(?:\\.exe)?$/.test(name)) return true;
    if (WRAPPERS.has(name)) continue;
    executable = false;
    shell = SHELLS.has(name);
    if (/^python[\\d.]*(?:\\.exe)?$/.test(name) && tokens[i + 1] === "-c") {
      const script = tokens[i + 2] || "";
      if (/\\b(?:import\\s+bpy|from\\s+bpy\\b)|__import__\\s*\\(\\s*['"]bpy['"]/.test(script)) return true;
    }
  }
  return false;
}

function canonicalize(target) {
  let current = path.resolve(target);
  const tail = [];
  for (;;) {
    try {
      return path.join(realpathSync(current), ...tail.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(target);
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

function insideDirectory(root, candidate) {
  const base = canonicalize(root);
  const abs = path.isAbsolute(candidate) ? candidate : path.resolve(base, candidate);
  const resolved = canonicalize(abs);
  const rel = path.relative(base, resolved);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

function insideWorkspace(candidate) {
  if (!candidate) return true;
  return insideDirectory(CONFIG.workspace, candidate);
}

function isAllowedMcpSchemaFile(candidate) {
  if (!candidate || !CONFIG.mcpSchemaRoot || !CONFIG.allowedMcpServers.length) return false;
  if (!candidate.endsWith(".json")) return false;
  return CONFIG.allowedMcpServers.some((server) =>
    insideDirectory(path.join(CONFIG.mcpSchemaRoot, server), candidate),
  );
}

function decide(decision, reason) {
  process.stdout.write(JSON.stringify(reason ? { decision, reason } : { decision }) + "\\n");
}

let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw || "{}");
    if (CONFIG.textOnly) {
      decide("deny", "This tool is unavailable in this Kiteva stage.");
      return;
    }
    const call = input.toolCall || {};
    const args = call.args || input.tool_input || {};
    let serverName = call.server_name || input.server_name || "";
    let rawName = String(call.name || input.tool_name || "");

    if (rawName === "call_mcp_tool") {
      const mcpServer = args.ServerName ?? args.serverName ?? args.server_name;
      const mcpTool = args.ToolName ?? args.toolName ?? args.tool_name;
      if (typeof mcpServer !== "string" || typeof mcpTool !== "string" || !mcpServer || !mcpTool) {
        decide("deny", "This MCP tool is unavailable in this Kiteva stage.");
        return;
      }
      serverName = mcpServer;
      rawName = mcpTool;
    }

    const normalized = serverName && !rawName.startsWith("mcp__") ? \`mcp__\${serverName}__\${rawName}\` : rawName;

    if (serverName || normalized.startsWith("mcp__")) {
      if (!CONFIG.allowedMcpTools.includes(normalized)) {
        decide("deny", "This MCP tool is unavailable in this Kiteva stage.");
        return;
      }
      decide("auto_approve");
      return;
    }

    if (!CONFIG.enabledTools.includes(normalized)) {
      decide("deny", "This tool is unavailable in this Kiteva stage.");
      return;
    }

    if (FILE_TOOLS.has(normalized)) {
      const canReadMcpSchema = READ_FILE_TOOLS.has(normalized);
      const pathAllowed = (candidate) =>
        insideWorkspace(candidate) || (canReadMcpSchema && isAllowedMcpSchemaFile(candidate));
      const canonical = call.canonical_path || input.canonical_path;
      if (typeof canonical === "string" && canonical && !pathAllowed(canonical)) {
        decide("deny", "File access outside the Kiteva project workspace is denied.");
        return;
      }
      for (const key of PATH_KEYS) {
        if (typeof args[key] === "string" && args[key] && !pathAllowed(args[key])) {
          decide("deny", "File access outside the Kiteva project workspace is denied.");
          return;
        }
      }
    }

    if (normalized === "run_command") {
      const cmd = args.command ?? args.CommandLine ?? args.cmd;
      if (typeof cmd !== "string") {
        decide("deny", "The command could not be inspected.");
        return;
      }
      if (invokesBlender(cmd)) {
        decide("deny", "Blender execution is disabled in Kiteva. Use permitted code-based tools, or report a capability limitation when Blender is essential.");
        return;
      }
    }

    decide("allow");
  } catch (err) {
    decide("deny", "Kiteva policy hook failed closed.");
  }
});
`;
}

export function buildAgyArgs(input: {
  model: string;
  prompt: string;
  systemPrompt: string;
  jsonSchema: Record<string, unknown>;
  schemaFile: string;
  settingsFile: string;
  textOnly: boolean;
  readOnly: boolean;
  sessionId?: string;
  effort?: GeminiEffort;
  stagedImagePaths?: string[];
}): string[] {
  const imageSection = input.stagedImagePaths?.length
    ? `\n\nAttached image files inside this workspace (inspect with view_file):\n${input.stagedImagePaths.map((p) => `- ${p}`).join("\n")}`
    : "";
  const fullPrompt = [
    input.systemPrompt.trim()
      ? `<system-instructions>\n${input.systemPrompt.trim()}\n</system-instructions>`
      : "",
    `${input.prompt}${imageSection}`,
    `Return only JSON matching this output schema:\n${JSON.stringify(input.jsonSchema)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const args: string[] = [
    "--output-format",
    "stream-json",
    "--model",
    input.model,
    "--json-schema",
    input.schemaFile,
    "--settings",
    input.settingsFile,
  ];

  if (input.effort) {
    args.push("--effort", input.effort);
  }

  if (input.textOnly) {
    args.push("--mode", "plan", "--sandbox", "--disable-slash-commands");
  } else if (input.readOnly) {
    args.push("--mode", "plan", "--sandbox");
  } else {
    args.push("--dangerously-skip-permissions", "--sandbox");
  }

  if (input.sessionId?.trim()) {
    args.push("--conversation", input.sessionId.trim());
  }

  args.push(`--print=${fullPrompt}`);
  return args;
}

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function prepareAgyCliConfiguration(
  options: AgentExecutionOptions,
  effort?: GeminiEffort,
): Promise<PreparedAgyCliConfiguration> {
  const agyBin = resolveAgyBinary();
  const directories = await createGeminiDirectories(options.workspace);
  const invocationId = randomUUID();
  const invocationDir = path.join(directories.root, "cli", invocationId);
  await mkdir(invocationDir, { recursive: true, mode: 0o700 });

  const textOnly = Boolean(options.textOnly);
  const readOnly = Boolean(options.readOnly);
  const enabledTools = [...geminiCliEnabledTools({ textOnly, readOnly })];
  const servers = textOnly ? {} : options.capabilityServers || {};
  const allowedMcpTools = Object.entries(servers).flatMap(([name, server]) =>
    server.enabledTools.map((tool) => `mcp__${name}__${tool}`),
  );

  const schemaFile = path.join(invocationDir, "schema.json");
  const settingsFile = path.join(invocationDir, "settings.json");
  const hookScript = path.join(invocationDir, "pretool-hook.mjs");

  const stagedImagePaths: string[] = [];
  const stagedImageDir = path.join(options.workspace, ".kiteva-inputs", "gemini-cli", invocationId);
  if (options.images?.length) {
    await mkdir(stagedImageDir, { recursive: true, mode: 0o700 });
    for (const [index, file] of options.images.entries()) {
      options.signal.throwIfAborted();
      const extension = path.extname(file).toLowerCase();
      if (!imageMimeTypes[extension]) {
        throw Error("Gemini image input requires PNG, JPEG, WebP or GIF.");
      }
      const targetName = `image-${index + 1}${extension}`;
      const targetPath = path.join(stagedImageDir, targetName);
      await copyFile(file, targetPath);
      stagedImagePaths.push(path.relative(options.workspace, targetPath));
    }
  }

  await Promise.all([
    writeFile(schemaFile, JSON.stringify(options.jsonSchema), {
      mode: 0o600,
      signal: options.signal,
    }),
    writeFile(
      settingsFile,
      JSON.stringify({
        allowNonWorkspaceAccess: false,
        enableTerminalSandbox: true,
        artifactReviewPolicy: "always-proceed",
        notifications: false,
        disableSlashCommands: textOnly,
        permissions: {
          allow: textOnly ? [] : Object.keys(servers).map((name) => `mcp(${name}/*)`),
          deny: [
            "read_url(*)",
            "execute_url(*)",
            "command(blender)",
            ...(textOnly ? ["command(*)", "read_file(*)", "write_file(*)", "mcp(*)"] : []),
            ...(!textOnly && readOnly ? ["command(*)", "write_file(*)"] : []),
          ],
        },
      }),
      { mode: 0o600, signal: options.signal },
    ),
    writeFile(
      hookScript,
      buildAgyPreToolHookSource({
        workspace: path.resolve(options.workspace),
        textOnly,
        enabledTools,
        allowedMcpTools,
        allowedMcpServers: Object.keys(servers),
        mcpSchemaRoot: path.join(userHome(), ".gemini", "antigravity-cli", "mcp"),
      }),
      { mode: 0o700, signal: options.signal },
    ),
  ]);

  const agentsDir = path.join(options.workspace, ".agents");
  const hooksConfigPath = path.join(agentsDir, "hooks.json");
  const mcpConfigPath = path.join(agentsDir, "mcp_config.json");
  await mkdir(agentsDir, { recursive: true });
  const [previousHooks, previousMcp] = await Promise.all([
    readIfExists(hooksConfigPath),
    readIfExists(mcpConfigPath),
  ]);

  const hooksConfig = {
    hooks: {
      PreToolUse: [
        {
          matcher: "*",
          hooks: [
            {
              type: "command",
              command: `${JSON.stringify(process.execPath)} ${JSON.stringify(hookScript)}`,
              timeout: 30,
            },
          ],
        },
      ],
    },
  };
  const mcpConfig = {
    mcpServers: Object.fromEntries(
      Object.entries(servers).map(([name, server]) => [
        name,
        {
          command: server.command,
          args: server.args,
          env: server.env,
          timeoutSeconds: server.toolTimeoutSeconds || 60,
        },
      ]),
    ),
  };
  await Promise.all([
    writeFile(hooksConfigPath, JSON.stringify(hooksConfig, null, 2), {
      mode: 0o600,
      signal: options.signal,
    }),
    writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), {
      mode: 0o600,
      signal: options.signal,
    }),
  ]);

  const cleanup = async () => {
    await Promise.all([
      previousHooks === null
        ? rm(hooksConfigPath, { force: true }).catch(() => {})
        : writeFile(hooksConfigPath, previousHooks, { mode: 0o600 }).catch(() => {}),
      previousMcp === null
        ? rm(mcpConfigPath, { force: true }).catch(() => {})
        : writeFile(mcpConfigPath, previousMcp, { mode: 0o600 }).catch(() => {}),
      stagedImagePaths.length
        ? rm(stagedImageDir, { recursive: true, force: true }).catch(() => {})
        : Promise.resolve(),
      rm(invocationDir, { recursive: true, force: true }).catch(() => {}),
    ]);
  };

  return {
    agyBin,
    args: buildAgyArgs({
      model: options.model,
      prompt: options.prompt,
      systemPrompt: options.systemPrompt,
      jsonSchema: options.jsonSchema,
      schemaFile,
      settingsFile,
      textOnly,
      readOnly,
      sessionId: options.sessionId,
      effort,
      stagedImagePaths,
    }),
    env: agyChildEnvironment(options.workspace),
    directories,
    schemaFile,
    settingsFile,
    hookScript,
    cleanup,
  };
}
