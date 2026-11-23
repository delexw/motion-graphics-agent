import { expect, type Page } from "@playwright/test";

function visibleOptions(page: Page) {
  return page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)");
}

/** Wait for the active virtual row rather than racing React's keyboard update. */
export async function nextSelectOption(page: Page) {
  const activeOption = visibleOptions(page).last().locator(".ant-select-item-option-active");
  const previous = await activeOption.textContent();
  await page.keyboard.press("ArrowDown");
  await expect(activeOption).not.toHaveText(previous ?? "");
}

/** Select a currently rendered option through the control's native keyboard path. */
export async function chooseRenderedSelectOption(page: Page, selector: string) {
  const target = page.locator(selector);
  await expect(target).toBeVisible();
  const count = await visibleOptions(page).locator(".ant-select-item-option").count();
  for (let index = 0; index <= count; index++) {
    const state = await target.evaluate((element) => {
      const option = element.closest(".ant-select-item-option");
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
