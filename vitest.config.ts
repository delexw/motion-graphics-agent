import { credentialEnvironmentVariables } from "./src/server/runtime/credential-environment.ts";
import { browserAliases } from "./vite.resolve.ts";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: browserAliases },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 15000,
    setupFiles: ["tests/setup.ts"],
    // Never inherit real provider credentials or load them from local dotenv files.
    env: Object.fromEntries(
      Object.values(credentialEnvironmentVariables).map((name) => [name, ""]),
    ),
    pool: "threads",
    // Isolate modules by file and reset mock and environment state before every case.
    isolate: true,
    mockReset: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
