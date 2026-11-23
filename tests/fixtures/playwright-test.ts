import { test as base, type BrowserContext } from "@playwright/test";

const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

export async function restrictBrowserRequests(context: BrowserContext) {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (loopbackHosts.has(url.hostname) || url.protocol === "file:") {
      return route.continue();
    }
    return route.abort();
  });
}

export const test = base.extend<{ localFixtures: void }>({
  localFixtures: [
    async ({ context }, use) => {
      await restrictBrowserRequests(context);
      const fetch = globalThis.fetch;
      globalThis.fetch = (input, options) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (!loopbackHosts.has(url.hostname))
          return Promise.reject(Error("Browser tests require local fixtures or mocked responses."));
        return fetch(input, options);
      };
      try {
        await use(undefined);
      } finally {
        globalThis.fetch = fetch;
      }
    },
    { auto: true },
  ],
});
