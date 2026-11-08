import type { Browser } from "puppeteer-core";

/** Declare the scenario instead of inheriting a developer or CI accessibility preference. */
export async function newBrowserPage(
  browser: Browser,
  reducedMotion: "no-preference" | "reduce" = "no-preference",
) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reducedMotion }]);
  return page;
}
