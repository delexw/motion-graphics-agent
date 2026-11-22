import { Tooltip } from "antd";
import { Info } from "lucide-react";
import "./settings-help-tip.css";

export function SettingsHelpTip({ label, title }: { label: string; title: string }) {
  return (
    <Tooltip title={title} trigger={["hover", "focus"]}>
      <button type="button" className="settings-help-tip" aria-label={label}>
        <Info size={14} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
