import type { Page } from "puppeteer-core";

/** Wait for the active virtual row rather than racing React's keyboard update. */
export async function nextSelectOption(page: Page) {
  const previous = await page.$eval(
    ".ant-select-dropdown:not(.ant-select-dropdown-hidden)",
    (dropdown) => dropdown.querySelector(".ant-select-item-option-active")?.textContent,
  );
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(
    (last) => {
      const active = document.querySelector(
        ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-active",
      );
      return active && active.textContent !== last;
    },
    {},
    previous,
  );
}

/** Select a currently rendered option through the control's native keyboard path. */
export async function chooseRenderedSelectOption(page: Page, selector: string) {
  await page.waitForSelector(selector, { visible: true });
  const count = await page.$$eval(
    ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option",
    (options) => options.length,
  );
  for (let index = 0; index <= count; index++) {
    const state = await page.$eval(selector, (target) => {
      const option = target.closest(".ant-select-item-option");
      return {
        active: option?.classList.contains("ant-select-item-option-active"),
        disabled: option?.classList.contains("ant-select-item-option-disabled"),
      };
    });
    if (state.disabled) throw Error("Cannot choose a disabled select option");
    if (state.active) {
      await page.keyboard.press("Enter");
      return;
    }
    if (index < count) await nextSelectOption(page);
  }
  throw Error("Rendered select option did not become active through keyboard navigation");
}
