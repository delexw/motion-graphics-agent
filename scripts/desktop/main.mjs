import { fork } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, Menu, nativeImage, shell, Tray } from "electron";

const root = fileURLToPath(new URL("../../", import.meta.url));
const profile = path.join(root, ".data", "desktop", "profile");
mkdirSync(profile, { recursive: true });
app.setName("Kiteva");
app.setPath("userData", profile);

let tray;
let logo;
let window;
let opening;
let quitting = false;
let backend;

function openKiteva() {
  if (window && !window.isDestroyed()) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return;
  }
  opening ??= createWindow()
    .catch((error) => {
      if (quitting) return;
      const message = error.stderr?.trim() || error.message;
      console.error(message);
      dialog.showErrorBox("Kiteva could not open", message);
    })
    .finally(() => {
      opening = undefined;
    });
}

function startBackend() {
  if (backend) return backend.ready;
  const node = process.env.KITEVA_DESKTOP_NODE;
  if (!node) throw Error("Start Kiteva with npm run electron:prod.");
  const logPath = path.join(root, ".data", "desktop", "backend.log");
  const log = openSync(logPath, "a", 0o600);
  let child;
  try {
    child = fork(path.join(import.meta.dirname, "backend.ts"), [], {
      cwd: root,
      execPath: node,
      execArgv: ["--import", "tsx"],
      stdio: ["ignore", log, log, "ipc"],
      windowsHide: true,
    });
  } finally {
    closeSync(log);
  }

  const ready = new Promise((resolve, reject) => {
    child.once("message", (message) => {
      if (message?.type === "ready") resolve(new URL(message.origin).origin);
      if (message?.type === "startup-error") reject(Error(message.message));
    });
    child.once("error", reject);
    child.once("exit", () => reject(Error(`Kiteva's service exited. See ${logPath}.`)));
  });
  const exited = new Promise((resolve) => {
    child.once("error", () => {
      if (!child.pid) resolve();
    });
    child.once("exit", resolve);
  });
  const service = { child, ready, exited };
  backend = service;
  void exited.then(() => {
    if (backend !== service) return;
    backend = undefined;
    if (!quitting) window?.destroy();
  });
  return ready;
}

async function stopBackend() {
  const service = backend;
  if (!service) return;
  const { child, exited } = service;
  const timeout = setTimeout(() => child.kill("SIGKILL"), 30_000);
  try {
    if (child.connected) child.send("shutdown", () => {});
    await exited;
  } finally {
    clearTimeout(timeout);
  }
}

async function createWindow() {
  tray.setToolTip("Kiteva is starting");
  let origin;
  try {
    origin = await startBackend();
  } finally {
    tray.setToolTip("Kiteva");
  }
  if (quitting) return;

  window = new BrowserWindow({
    title: "Kiteva",
    icon: logo,
    width: 1320,
    height: 860,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.webContents.session.setPermissionRequestHandler(
    (contents, permission, callback, details) => {
      callback(permission === "notifications" && new URL(details.requestingUrl).origin === origin);
    },
  );
  window.webContents.session.setPermissionCheckHandler(
    (contents, permission, requestingOrigin) =>
      permission === "notifications" && requestingOrigin === origin,
  );
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  window.webContents.on("will-redirect", (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    const { protocol } = new URL(url);
    if (protocol === "https:" || protocol === "http:") {
      void shell.openExternal(url).catch((error) => console.error(error.message));
    }
    return { action: "deny" };
  });
  window.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    window?.hide();
  });
  window.on("closed", () => {
    window = undefined;
  });
  try {
    await window.loadURL(new URL("/projects", origin).href);
    window?.show();
  } catch (error) {
    window?.destroy();
    throw error;
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (app.isReady()) openKiteva();
  });
  app.on("activate", openKiteva);
  app.on("window-all-closed", () => {});
  app.on("before-quit", (event) => {
    if (!backend) {
      quitting = true;
      return;
    }
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    void stopBackend().finally(() => app.quit());
  });
  void app
    .whenReady()
    .then(() => {
      logo = nativeImage.createFromPath(path.join(root, "public", "kiteva-desktop.png"));
      app.dock?.setIcon(logo);
      tray = new Tray(logo.resize({ width: process.platform === "darwin" ? 18 : 20 }));
      tray.setToolTip("Kiteva");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "Open Kiteva", click: openKiteva },
          { type: "separator" },
          { label: "Quit Kiteva", role: "quit" },
        ]),
      );
      tray.on("double-click", openKiteva);
      openKiteva();
    })
    .catch((error) => {
      console.error(error.message);
      app.quit();
    });
}
