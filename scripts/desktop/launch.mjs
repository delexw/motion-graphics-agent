import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
if (!existsSync(path.join(root, "dist/client/index.html"))) {
  console.error("Kiteva's production build is missing. Run npm run build, then retry.");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const electronPackage = path.dirname(require.resolve("electron/package.json"));
const installedPath = path.join(electronPackage, "path.txt");
const electron = existsSync(installedPath)
  ? path.join(electronPackage, "dist", readFileSync(installedPath, "utf8").trim())
  : undefined;
if (!electron || !existsSync(electron)) {
  console.error("The Electron runtime is missing. Run npm run electron:setup, then retry.");
  process.exit(1);
}

const logPath = path.join(root, ".data", "desktop", "electron.log");
mkdirSync(path.dirname(logPath), { recursive: true });
const log = openSync(logPath, "a", 0o600);
try {
  const desktop = spawn(electron, [path.join(import.meta.dirname, "main.mjs")], {
    cwd: root,
    detached: true,
    env: { ...process.env, KITEVA_DESKTOP_NODE: process.execPath },
    stdio: ["ignore", log, log],
    windowsHide: true,
  });
  desktop.once("spawn", () => console.log(`Opening Kiteva. Desktop log: ${logPath}`));
  desktop.once("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  desktop.unref();
} finally {
  closeSync(log);
}
