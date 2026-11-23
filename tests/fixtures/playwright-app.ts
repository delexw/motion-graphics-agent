import { test as base } from "./playwright-test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBrowserFixtureServer } from "./browser-fixture-server";

export const test = base.extend<{ fixtureHtml: string; fixtureUrl: string }>({
  fixtureHtml: ["", { option: true }],
  fixtureUrl: async ({ context, fixtureHtml }, use) => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "browser-test-"));
    let server: Awaited<ReturnType<typeof createBrowserFixtureServer>> | undefined;
    try {
      server = await createBrowserFixtureServer({
        cacheDir,

        plugins: [
          {
            name: "browser-test-fixture",
            configureServer(vite) {
              vite.middlewares.use((request, response, next) => {
                if (request.url !== "/fixture") return next();
                void vite.transformIndexHtml("/fixture", fixtureHtml).then((html) => {
                  response.setHeader("content-type", "text/html");
                  response.end(html);
                }, next);
              });
            },
          },
        ],
      });
      await server.listen();
      const url = new URL("/fixture", server.resolvedUrls!.local[0]);
      await context.route("**/*", (route) => {
        const request = new URL(route.request().url());
        if (request.origin === url.origin && !request.pathname.startsWith("/api/")) {
          return route.continue();
        }
        return route.abort();
      });
      await use(url.href);
    } finally {
      try {
        await server?.close();
      } finally {
        await rm(cacheDir, { recursive: true, force: true });
      }
    }
  },
});
