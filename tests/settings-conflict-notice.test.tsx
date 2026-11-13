import { afterEach, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SettingsConflictError,
  type SettingsConflict,
} from "../src/shared/request-settings-review";
import {
  SettingsConflictNotice,
  settingValueText,
} from "../src/client/components/settings-conflict-notice";
import { uiLanguage } from "../src/client/i18n/service";
import { CodedError } from "../src/shared/errors";
const details = {
  requestHash: "a".repeat(64),
  model: "jev-1.14.0",
  conflicts: [
    {
      setting: "frameRate" as const,
      value: 60,
      source: { field: "instructions", label: "Main idea" },
    },
    {
      setting: "aspectRatio" as const,
      value: "16:9",
      source: { field: "requirements.images.instructions", label: "Image notes" },
    },
  ],
};
const props = { onEditSetting: () => {}, onEditSource: () => {} };
afterEach(async () => {
  await uiLanguage.change("en");
});
it("shows every setting value and actual source field without inventing a requested value or quote", () => {
  const html = renderToStaticMarkup(
    <SettingsConflictNotice error={new SettingsConflictError(details)} {...props} />,
  );
  expect(html).toContain("60 fps");
  expect(html).toContain("16:9");
  expect(html).toContain("Main idea");
  expect(html).toContain("Image notes");
  expect(html).toContain('role="alert"');
  expect(html).toContain("Change setting");
  expect(html).toContain("Edit brief");
  expect(html).not.toContain("24 fps");
  expect(html).not.toContain("Start anyway");
  expect(html).not.toContain("confidence");
});
it("hides stale conflict rows instead of presenting old settings as current", () => {
  const html = renderToStaticMarkup(
    <SettingsConflictNotice error={new SettingsConflictError(details)} stale {...props} />,
  );
  expect(html).toContain("Create again to check the new version");
  expect(html).not.toContain("60 fps");
  expect(html).not.toContain("Change setting");
});
it("reports unavailability as unchecked and preserves useful recovery copy", () => {
  const html = renderToStaticMarkup(
    <SettingsConflictNotice
      error={new CodedError("SETTINGS_CHECK_UNAVAILABLE", "Unavailable", 503)}
      {...props}
    />,
  );
  expect(html).toContain("Nothing has started");
  expect(html).toContain("Your brief and attachments are kept");
  expect(html).not.toContain("compatible");
});
it("translates conflict sources and recovery actions into Chinese", async () => {
  await uiLanguage.change("zh-CN");
  const html = renderToStaticMarkup(
    <SettingsConflictNotice error={new SettingsConflictError(details)} {...props} />,
  );
  expect(html).toContain("主要创意");
  expect(html).toContain("图片说明");
  expect(html).toContain("修改设置");
  expect(html).toContain("项目尚未开始");
});
it.each([
  ["frameRate", 60, "60 fps"],
  ["speech", { mode: "off" }, "Off"],
  ["duration", { mode: "auto" }, "Auto"],
  ["duration", { targetSeconds: 60 }, "60s (±5s)"],
  ["selectedStyleIds", [{ id: "style-001", name: "Watercolor" }], "Watercolor"],
  ["speech", { mode: "uploaded" }, "Uploaded audio"],
] as const)("formats actual %s setting values", (setting, value, text) => {
  expect(
    settingValueText({
      setting,
      value,
      source: { field: "instructions", label: "Main idea" },
    } as SettingsConflict),
  ).toBe(text);
});
