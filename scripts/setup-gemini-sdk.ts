import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { dataRoot } from "../src/server/runtime/paths";
import { defaultPython } from "../src/server/runtime/platform";
import { managedGeminiVenvPython } from "../src/server/agents/gemini/configuration";

const venvDir = path.join(dataRoot, "gemini-sdk-venv");
const venvPython = managedGeminiVenvPython();
const packageSpec = process.env.VIDEO_GEMINI_SDK_PACKAGE?.trim() || "google-antigravity";
const setupPython = process.env.VIDEO_GEMINI_SETUP_PYTHON?.trim();

function run(command: string, args: string[]) {
  execFileSync(command, args, { stdio: "inherit" });
}

function hasCommand(command: string, args: string[] = ["--version"]) {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

mkdirSync(dataRoot, { recursive: true, mode: 0o700 });

if (!existsSync(venvPython)) {
  if (hasCommand("uv")) {
    run("uv", [
      "venv",
      ...(setupPython ? ["--python", setupPython] : []),
      ...(!existsSync(venvPython) && existsSync(venvDir) ? ["--clear"] : []),
      venvDir,
    ]);
  } else {
    run(setupPython || defaultPython(), [
      "-m",
      "venv",
      ...(!existsSync(venvPython) && existsSync(venvDir) ? ["--clear"] : []),
      venvDir,
    ]);
  }
}

if (hasCommand("uv")) {
  run("uv", ["pip", "install", "--python", venvPython, "--upgrade", packageSpec]);
} else {
  run(venvPython, ["-m", "pip", "install", "--upgrade", packageSpec]);
}

run(venvPython, [
  "-c",
  "import google.antigravity as agt; print('google-antigravity ready:', getattr(agt, '__version__', 'installed'))",
]);
console.log(`Gemini Antigravity SDK environment ready at ${venvPython}`);
