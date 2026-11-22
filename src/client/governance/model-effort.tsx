import { Tag, Space } from "antd";
import { effortLevelLabels, type ModelEffort } from "../../shared/model-effort";
import type { ModelEffortCount } from "../../shared/governance";
import { translateUi } from "../i18n";

export function governanceEffortLabel(effort?: string | null) {
  if (!effort) return translateUi(effort === null ? "No effort sent" : "Not recorded");
  return Object.hasOwn(effortLevelLabels, effort)
    ? translateUi(effortLevelLabels[effort as ModelEffort])
    : effort;
}

export function GovernanceEffortCounts({ counts }: { counts: ModelEffortCount[] }) {
  return (
    <section aria-label={translateUi("Reasoning effort:")}>
      <strong>{translateUi("Reasoning effort:")}</strong>{" "}
      <Space wrap>
        {counts.map(({ effort, count }) => (
          <Tag key={effort}>
            {governanceEffortLabel(effort)} · {count}
          </Tag>
        ))}
      </Space>
    </section>
  );
}
