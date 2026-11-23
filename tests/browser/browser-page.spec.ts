import { expect } from "@playwright/test";
import { browserExecutablePath } from "../../src/server/runtime/browser";
import { test } from "../fixtures/playwright-test";

test.use({
  launchOptions: {
    executablePath: browserExecutablePath(true) ?? browserExecutablePath(),
    args: ["--force-prefers-reduced-motion"],
  },
});

test("declares normal and reduced-motion scenarios even when the host forces reduced motion", async ({
  browser,
  context,
  page,
}) => {
  const inherited = await browser.newContext({ reducedMotion: "reduce" });
  try {
    expect(
      await (
        await inherited.newPage()
      ).evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    ).toBe(true);
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
      false,
    );
    await context.addCookies([{ name: "scenario", value: "normal", url: "http://localhost" }]);
    expect(await inherited.cookies()).toEqual([]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
      true,
    );
  } finally {
    await inherited.close();
  }
});
