import { Flex, Select } from "antd";
import { translateUi } from "../i18n";
import { SettingsHelpTip } from "./settings-help-tip";

export function ProjectEffortSelect({
  checked,
  loading,
  onChange,
}: {
  checked: boolean;
  loading?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const label = translateUi("Adjustive effort");
  return (
    <Flex vertical gap="small" className="settings-field">
      <span className="settings-field-label">
        {label}
        <SettingsHelpTip
          label={translateUi("About adjustive effort")}
          title={translateUi(
            "Yes adjusts reasoning effort for each supported model call. No uses the default for that call.",
          )}
        />
      </span>
      <Select
        aria-label={label}
        value={checked ? "yes" : "no"}
        options={[
          { value: "no", label: translateUi("No") },
          { value: "yes", label: translateUi("Yes") },
        ]}
        loading={loading}
        disabled={loading}
        onChange={(value) => onChange(value === "yes")}
      />
    </Flex>
  );
}
