import { Alert, Button, Space } from "antd";
import { useEffect, useRef } from "react";
import { translateUi, useUiLanguage } from "../i18n";
import {
  SettingsConflictError,
  requestSettingLabels,
  type SettingsConflict,
} from "../../shared/request-settings-review";
import { errorCode } from "../../shared/errors";

export function settingValueText(conflict: SettingsConflict): string {
  const value = conflict.value;
  if (typeof value === "number")
    return conflict.setting === "frameRate" ? `${value} fps` : String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value
      .map((entry) =>
        typeof entry === "object" && entry !== null && !Array.isArray(entry)
          ? String(entry.name ?? entry.id ?? JSON.stringify(entry))
          : String(entry),
      )
      .join(", ");
  if (value && typeof value === "object") {
    if (value.mode === "off") return translateUi("Off");
    if (value.mode === "auto") return translateUi("Auto");
    if (typeof value.targetSeconds === "number") return `${value.targetSeconds}s (±5s)`;
    if (value.mode === "narration")
      return [translateUi("Narration"), value.engine, value.voice, value.language]
        .filter(Boolean)
        .join(" · ");
    if (value.mode === "uploaded") return translateUi("Uploaded audio");
  }
  return JSON.stringify(value);
}

export function SettingsConflictNotice({
  error,
  stale = false,
  onEditSetting,
  onEditSource,
}: {
  error: unknown;
  stale?: boolean;
  onEditSetting: (setting: SettingsConflict["setting"]) => void;
  onEditSource: (field: string) => void;
}) {
  useUiLanguage();
  const heading = useRef<HTMLHeadingElement>(null);
  const conflict = error instanceof SettingsConflictError ? error : undefined;
  const unavailable = errorCode(error) === "SETTINGS_CHECK_UNAVAILABLE";
  useEffect(() => {
    if (conflict || unavailable) heading.current?.focus();
  }, [conflict, unavailable]);
  if (!conflict && !unavailable) return null;
  const title = stale
    ? "You've changed your brief. Create again to check the new version."
    : conflict
      ? "Your brief disagrees with your project settings. Nothing has started."
      : "We couldn't check your brief against your settings. Nothing has started.";
  return (
    <Alert
      type={conflict ? "warning" : "error"}
      showIcon
      role="alert"
      title={
        <h3 ref={heading} tabIndex={-1}>
          {translateUi(title)}
        </h3>
      }
      description={
        <>
          <p>
            {translateUi(
              conflict
                ? "Change the setting or the brief, then create again. Your brief and attachments are kept."
                : "Your brief and attachments are kept. Try creating again when the check is available.",
            )}
          </p>
          {conflict && !stale && (
            <ul>
              {conflict.details.conflicts.map((item) => (
                <li key={`${item.setting}:${item.source.field}`}>
                  <p>
                    <strong>{translateUi(requestSettingLabels[item.setting])}</strong>
                    {": "}
                    {settingValueText(item)}
                  </p>
                  <p>
                    {translateUi("Conflicting requirement in: {{value0}}", {
                      value0: translateUi(item.source.label),
                    })}
                  </p>
                  <Space wrap>
                    <Button
                      size="small"
                      onClick={() => onEditSetting(item.setting)}
                      aria-label={`${translateUi("Change setting")}: ${translateUi(requestSettingLabels[item.setting])}`}
                    >
                      {translateUi("Change setting")}
                    </Button>
                    <Button
                      size="small"
                      onClick={() => onEditSource(item.source.field)}
                      aria-label={`${translateUi("Edit brief")}: ${translateUi(item.source.label)}`}
                    >
                      {translateUi("Edit brief")}
                    </Button>
                  </Space>
                </li>
              ))}
            </ul>
          )}
        </>
      }
    />
  );
}
