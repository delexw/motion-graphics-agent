import { settingsCheckActivity } from "../../shared/settings-check-accounting";
import { formatGovernanceCost } from "./format-cost";
import { Card, Table, Tag, Typography, Input } from "antd";
import { translateUi, uiLanguage } from "../i18n";
import {
  requestSettingLabels,
  type SettingsCheckRecord,
} from "../../shared/request-settings-review";
import { settingValueText } from "../components/settings-conflict-notice";

/** Includes blocked starts, which have no project activity timeline. */
export function SettingsChecks({
  records,
  pagination,
  onPage,
  onSearch,
}: {
  records: SettingsCheckRecord[];
  pagination?: import("../../shared/governance").GovernancePagination;
  onPage?: (page: number, pageSize: number) => void;
  onSearch?: (query: string) => void;
}) {
  return (
    <Card title={translateUi("Request/settings compatibility check")}>
      <Typography.Paragraph>
        {translateUi(
          "Independent JEV strategy before project creation. Blocked and failed checks are retained without creating a project. Showing the requested page of checks.",
        )}
      </Typography.Paragraph>
      {onSearch && (
        <Input.Search
          aria-label={translateUi("Search settings checks")}
          placeholder={translateUi("Search model or status")}
          allowClear
          onSearch={onSearch}
        />
      )}
      <Table
        dataSource={records.map((row) => ({ ...row, accounting: settingsCheckActivity(row) }))}
        rowKey="id"
        size="small"
        scroll={{ x: 1250 }}
        pagination={
          pagination
            ? {
                current: pagination.page,
                pageSize: pagination.pageSize,
                total: pagination.total,
                showSizeChanger: true,
                onChange: onPage,
              }
            : { pageSize: 10 }
        }
        locale={{ emptyText: translateUi("No settings checks recorded yet.") }}
        columns={[
          {
            title: translateUi("Started"),
            dataIndex: "startedAt",
            render: (value: string) => uiLanguage.date(value),
          },
          { title: translateUi("Model"), dataIndex: "model" },
          {
            title: translateUi("Status"),
            render: (_, row) => (
              <Tag
                color={
                  row.status === "compatible"
                    ? "green"
                    : row.status === "conflict"
                      ? "orange"
                      : undefined
                }
              >
                {translateUi(
                  {
                    checking: "No final result recorded",
                    compatible: "Compatible",
                    conflict: "Conflicts found",
                    failed: "Check failed / start blocked",
                  }[row.status],
                )}
              </Tag>
            ),
          },
          {
            title: translateUi("Duration"),
            render: (_, row) =>
              row.finishedAt ? `${Date.parse(row.finishedAt) - Date.parse(row.startedAt)} ms` : "—",
          },
          {
            title: translateUi("Input tokens"),
            render: (_, row) =>
              row.accounting.inputTokens?.toLocaleString() ?? translateUi("Not recorded"),
          },
          {
            title: translateUi("Output tokens"),
            render: (_, row) =>
              row.accounting.outputTokens?.toLocaleString() ?? translateUi("Not recorded"),
          },
          {
            title: translateUi("Estimated USD"),
            render: (_, row) => (
              <div>
                {row.accounting.costLow === null
                  ? translateUi("Unavailable")
                  : formatGovernanceCost(row.accounting.costLow)}
                <br />
                <Typography.Text type="secondary">
                  {translateUi(row.accounting.costBasis)}
                </Typography.Text>
              </div>
            ),
          },
          {
            title: translateUi("Conflicting settings"),
            render: (_, row) =>
              row.review?.conflicts
                .map((item) => translateUi(requestSettingLabels[item.setting]))
                .join(", ") || "—",
          },
        ]}
        expandable={{
          expandedRowRender: (row) => (
            <div>
              <p>
                {translateUi("Draft / project")}: {row.draftId ?? "—"} / {row.runId ?? "—"}
              </p>
              {row.review && row.review.conflicts.length > 0 && (
                <ul>
                  {row.review.conflicts.map((conflict) => (
                    <li key={conflict.setting}>
                      {translateUi(requestSettingLabels[conflict.setting])}:{" "}
                      {settingValueText(conflict)} · {translateUi("Conflicting input")}:{" "}
                      {translateUi(conflict.source.label)}
                    </li>
                  ))}
                </ul>
              )}
              <Typography.Paragraph>
                {translateUi(
                  "Recorded JEV input, response and usage. Internal provider prompts are not exposed; absent usage is not zero usage.",
                )}
              </Typography.Paragraph>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  maxHeight: 480,
                  overflow: "auto",
                }}
              >
                {JSON.stringify(row.events, null, 2)}
              </pre>
            </div>
          ),
        }}
      />
    </Card>
  );
}
