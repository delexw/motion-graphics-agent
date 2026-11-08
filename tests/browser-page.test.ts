import puppeteer from "puppeteer-core";
import { expect, it } from "vitest";
import { browserExecutablePath } from "../src/server/runtime/browser";
import { newBrowserPage } from "./fixtures/browser-page";

it("declares normal and reduced-motion scenarios even when the host forces reduced motion", async () => {
  const browser = await puppeteer.launch({
    executablePath: browserExecutablePath(),
    headless: "shell",
    pipe: true,
    args: ["--force-prefers-reduced-motion"],
  });
  try {
    const inherited = await browser.newPage();
    expect(
      await inherited.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    ).toBe(true);
    const normal = await newBrowserPage(browser);
    expect(
      await normal.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    ).toBe(false);
    const reduced = await newBrowserPage(browser, "reduce");
    expect(
      await reduced.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    ).toBe(true);
  } finally {
    await browser.close();
  }
});
