import { Segmented, Space, Typography } from "antd";
import { useId, type ReactNode } from "react";
import { translateUi } from "../../i18n";

export function ProjectReuseChoice({
  label,
  description,
  annotation,
  keep,
  disabled,
  onChange,
}: {
  label: string;
  description?: ReactNode;
  annotation?: ReactNode;
  keep: boolean;
  disabled?: boolean;
  onChange: (keep: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="project-reuse-choice">
      <div>
        <Space size={6} wrap>
          <Typography.Text strong>{translateUi(label)}</Typography.Text>
          {annotation}
        </Space>
        {description && (
          <div>
            <Typography.Text type="secondary">{description}</Typography.Text>
          </div>
        )}
      </div>
      <Segmented
        name={`${id}-${label}`}
        aria-label={translateUi(label)}
        value={keep ? "keep" : "replace"}
        disabled={disabled}
        onChange={(value) => onChange(value === "keep")}
        options={[
          { label: translateUi("Keep"), value: "keep" },
          { label: translateUi("Choose again"), value: "replace" },
        ]}
      />
    </div>
  );
}
