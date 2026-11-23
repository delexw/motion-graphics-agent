import { defineConfig } from "@playwright/test";
import { browserExecutablePath } from "./src/server/runtime/browser";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.{ts,tsx}",
  timeout: 60_000,
  fullyParallel: true,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI
    ? [["list"], ["json", { outputFile: "test-results/playwright.json" }]]
    : "list",
  use: {
    launchOptions: { executablePath: browserExecutablePath(true) ?? browserExecutablePath() },
    viewport: { width: 1200, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
    actionTimeout: 12_000,
    navigationTimeout: 20_000,
    trace: "retain-on-failure",
  },
});
