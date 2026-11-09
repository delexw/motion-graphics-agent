import { useSyncExternalStore } from "react";
import { Segmented } from "antd";
import { Bell, BellOff } from "lucide-react";
import { translateUi, useUiLanguage } from "../i18n";
import { previewNotificationPreference } from "../lib/preview-notification";

export function PreviewNotificationSwitch() {
  useUiLanguage();
  const enabled = useSyncExternalStore(
    previewNotificationPreference.subscribe,
    previewNotificationPreference.get,
    () => false,
  );
  return (
    <Segmented
      className="room-language-switch"
      size="small"
      aria-label={translateUi("Preview notifications")}
      value={enabled ? "on" : "off"}
      options={[
        {
          value: "on",
          icon: <Bell size={14} />,
          title: translateUi("Notify with a sound when all preview directions finish"),
        },
        {
          value: "off",
          icon: <BellOff size={14} />,
          title: translateUi("Preview notifications off"),
        },
      ]}
      onChange={(value) => previewNotificationPreference.set(value === "on")}
    />
  );
}
