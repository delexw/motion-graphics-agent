import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer, type PluginOption, type UserConfig } from "vite";
import { browserAliases, browserDependencyScan } from "../../vite.resolve";

const appRoot = fileURLToPath(new URL("../../", import.meta.url));

export function createBrowserFixtureServer({
  cacheDir,
  plugins = [],
  logLevel,
}: {
  cacheDir: string;
  plugins?: PluginOption[];
  logLevel?: UserConfig["logLevel"];
}) {
  return createServer({
    root: appRoot,
    configFile: false,
    envDir: false,
    cacheDir,
    resolve: { alias: browserAliases },
    optimizeDeps: browserDependencyScan,
    server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
    plugins: [react(), ...plugins],
    logLevel,
  });
}
