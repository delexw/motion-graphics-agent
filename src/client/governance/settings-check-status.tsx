import { Tag } from "antd";
import type { SettingsCheckRecord } from "../../shared/request-settings-review";
import { translateUi } from "../i18n";

const statuses = {
  checking: { label: "No final result recorded", colour: undefined },
  compatible: { label: "Compatible", colour: "green" },
  conflict: { label: "Conflicts found", colour: "orange" },
  failed: { label: "Check failed / start blocked", colour: undefined },
} as const;

export function SettingsCheckStatus({ status }: { status: SettingsCheckRecord["status"] }) {
  const { label, colour } = statuses[status];
  return <Tag color={colour}>{translateUi(label)}</Tag>;
}
