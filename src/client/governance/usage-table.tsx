import { GovernanceJevDetails, jevUsageVariants } from "./jev-details";
import { GovernanceRowDetails } from "./row-details";
import { GovernanceEffortCounts } from "./model-effort";
import type { Style } from "../../shared/contracts";
import { formatGovernanceCost } from "./format-cost";
import { translateUi, useUiLanguage } from "../i18n";
import { Table, Typography, type TableColumnsType } from "antd";
import type { ModelActivity } from "../../shared/governance";
const tokens = (value: number | null | undefined) =>
  value == null ? translateUi("Not recorded") : value.toLocaleString();
const probability = (value: number | null) =>
  value === null ? translateUi("Not recorded") : `${Math.round(value * 100)}%`;
const money = (row: ModelActivity) =>
  row.costLow === null
    ? translateUi("Unavailable")
    : row.costHigh !== row.costLow
      ? `${formatGovernanceCost(row.costLow)}–${formatGovernanceCost(row.costHigh!)}`
      : formatGovernanceCost(row.costLow);
export function GovernanceUsageTable({
  rows,
  styles = [],
  byFunction = false,
}: {
  rows: ModelActivity[];
  styles?: Pick<Style, "id" | "name_en">[];
  byFunction?: boolean;
}) {
  useUiLanguage();
  const columns: TableColumnsType<ModelActivity> = [
    {
      title: byFunction ? translateUi("Model / function") : translateUi("Model"),
      dataIndex: "model",
      key: "model",
      width: 230,
      render: (_, row) => (
        <>
          <strong>{row.model}</strong>
          {byFunction && (
            <div className="governance-table-detail">
              {row.purpose && translateUi(row.purpose)}
              {row.cacheHits
                ? translateUi(" · {{value0}} cached summaries reused", { value0: row.cacheHits })
                : ""}
            </div>
          )}
          {byFunction &&
            row.authoringSelections?.map((selection) => (
              <div key={selection.jobId} className="governance-table-detail">
                <div>
                  {translateUi(selection.kind === "preview" ? "Preview" : "Full film")}
                  {selection.direction && ` · ${selection.direction}`}
                </div>
                {selection.resources
                  .filter((resource) => resource.selected)
                  .map((resource) => (
                    <div key={resource.id}>
                      {translateUi("Selected authoring resource")}: {translateUi(resource.name)} (
                      {probability(resource.probability)})
                    </div>
                  ))}
              </div>
            ))}
        </>
      ),
    },
    {
      title: translateUi("Invocations"),
      dataIndex: "calls",
      key: "calls",
      width: 100,
      sorter: (a, b) => a.calls - b.calls,
    },
    {
      title: translateUi("Tools"),
      dataIndex: "tools",
      key: "tools",
      width: 70,
      sorter: (a, b) => a.tools - b.tools,
    },
    {
      title: translateUi("Total input tokens"),
      dataIndex: "inputTokens",
      key: "inputTokens",
      width: 110,
      render: tokens,
    },
    {
      title: translateUi("Output tokens"),
      dataIndex: "outputTokens",
      key: "outputTokens",
      width: 110,
      render: tokens,
    },
    {
      title: translateUi("Uncached input"),
      dataIndex: "uncachedInputTokens",
      key: "uncachedInputTokens",
      width: 110,
      render: tokens,
    },
    {
      title: translateUi("Cache reads"),
      dataIndex: "cachedTokens",
      key: "cachedTokens",
      width: 110,
      render: tokens,
    },
    {
      title: translateUi("Cache writes"),
      key: "cacheWriteTokens",
      width: 150,
      render: (_, row) => (
        <>
          {tokens(row.cacheWriteTokens)}
          {(row.cacheWrite5mTokens != null || row.cacheWrite1hTokens != null) && (
            <div className="governance-table-detail">
              5m: {tokens(row.cacheWrite5mTokens)} · 1h: {tokens(row.cacheWrite1hTokens)}
            </div>
          )}
        </>
      ),
    },
    {
      title: translateUi("Estimated USD"),
      key: "cost",
      width: 160,
      fixed: "right",
      render: (_, row) => (
        <>
          {money(row)}
          <div>
            <Typography.Text type="secondary" className="governance-table-detail">
              {translateUi(byFunction ? row.costBasis : "Known subtotal")}
            </Typography.Text>
          </div>
        </>
      ),
    },
  ];
  return (
    <Table<ModelActivity>
      expandable={
        byFunction || rows.some((row) => row.jevCalls?.length || row.effortCounts?.length)
          ? {
              fixed: true,
              rowExpandable: (row) =>
                Boolean(
                  row.jevCalls?.length ||
                  row.effortCounts?.length ||
                  (byFunction && jevUsageVariants(row).length),
                ),
              expandedRowRender: (row) => (
                <GovernanceRowDetails>
                  {row.effortCounts?.length ? (
                    <GovernanceEffortCounts counts={row.effortCounts} />
                  ) : null}
                  <GovernanceJevDetails
                    calls={row.jevCalls}
                    variants={byFunction ? jevUsageVariants(row) : undefined}
                    styles={styles}
                  />
                </GovernanceRowDetails>
              ),
            }
          : undefined
      }
      className="governance-ant-table"
      columns={columns}
      dataSource={rows}
      rowKey={(row) => `${row.model}|${row.purpose}`}
      pagination={false}
      tableLayout="fixed"
      scroll={{ x: 1300 }}
      size="small"
      locale={{ emptyText: translateUi("No model activity recorded.") }}
    />
  );
}
