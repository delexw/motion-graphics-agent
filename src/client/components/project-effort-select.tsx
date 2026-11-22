import { Alert, Flex, Select } from "antd";
import { useState } from "react";
import type { Run } from "../../shared/contracts";
import { usesDynamicModelEffort } from "../../shared/model-effort";
import { translateUi } from "../i18n";
import { api } from "../lib/api";
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

export function SavedProjectEffortSelect({
  run,
  onUpdated,
}: {
  run: Run;
  onUpdated: (run: Run) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save(dynamicModelEffort: boolean) {
    setSaving(true);
    setFailed(false);
    try {
      onUpdated(
        await api<Run>(`/api/runs/${encodeURIComponent(run.id)}/model-effort`, {
          method: "PATCH",
          body: JSON.stringify({ dynamicModelEffort }),
        }),
      );
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Flex vertical gap={4}>
      <ProjectEffortSelect
        checked={usesDynamicModelEffort(run.request)}
        loading={saving}
        onChange={save}
      />
      {failed && (
        <Alert type="error" showIcon title={translateUi("Could not save model effort setting.")} />
      )}
    </Flex>
  );
}
