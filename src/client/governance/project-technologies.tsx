import { Alert, Table, Tag, Typography } from "antd";
import type { ProjectTechnologyMonitor } from "../../shared/project-technologies";
import { translateUi } from "../i18n";

export function ProjectTechnologies({
  jobs,
  onPage,
  embedded = false,
}: {
  jobs: ProjectTechnologyMonitor[];
  onPage?: (page: number, pageSize: number) => void;
  /** Rendered inside a panel that already shows the "Project technologies" title. */
  embedded?: boolean;
}) {
  return (
    <section aria-label={translateUi("Project technologies")} className="project-technologies">
      {!embedded && (
        <Typography.Title level={4}>{translateUi("Project technologies")}</Typography.Title>
      )}
      <Typography.Paragraph type="secondary" className="project-technologies__note">
        {translateUi(
          "Code API calls, browser loading and runtime evidence are separate. Code locations show authored calls, not proof that those branches executed. Loading a dependency or reading its version does not prove usage. Python execution and validated renders have independent evidence. Missing or changed evidence remains unverified.",
        )}
      </Typography.Paragraph>
      {jobs.map((job) => (
        <div key={job.jobId} className="project-technologies__job">
          <Typography.Text type="secondary" className="project-technologies__meta">
            {translateUi("Job ID")}:{" "}
            <Typography.Text type="secondary" code>
              {job.jobId}
            </Typography.Text>
          </Typography.Text>
          {job.error && <Alert type="warning" showIcon title={translateUi(job.error)} />}
          {!job.updatedAt && !job.error && (
            <Alert
              type="info"
              showIcon
              title={translateUi("Selection not recorded yet")}
              description={translateUi(
                "This job may still be generating. “Not recorded” means no saved final selection exists for that technology yet; it is not the same as “Not selected”.",
              )}
            />
          )}
          <Table
            rowKey="id"
            size="small"
            locale={{ emptyText: translateUi("No technologies match these filters.") }}
            dataSource={[...job.entries].sort(
              (a, b) =>
                Number(b.selected) - Number(a.selected) ||
                Number(b.browserLoaded) - Number(a.browserLoaded),
            )}
            pagination={
              job.pagination
                ? {
                    current: job.pagination.page,
                    pageSize: job.pagination.pageSize,
                    total: job.pagination.total,
                    showSizeChanger: true,
                    onChange: onPage,
                  }
                : { pageSize: 8 }
            }
            scroll={{ x: 850 }}
            columns={[
              { title: translateUi("Technology"), dataIndex: "name" },
              {
                title: translateUi("Selection"),
                filters: onPage
                  ? undefined
                  : [
                      { text: translateUi("Selected"), value: "selected" },
                      { text: translateUi("Not selected"), value: "not_selected" },
                      { text: translateUi("Not recorded"), value: "unknown" },
                    ],
                onFilter: (value, row) =>
                  value ===
                  (row.selected === null ? "unknown" : row.selected ? "selected" : "not_selected"),
                render: (_, row) => (
                  <Tag color={row.selected ? "blue" : row.selected === null ? "gold" : undefined}>
                    {translateUi(
                      row.selected === null
                        ? "Not recorded"
                        : row.selected
                          ? "Selected"
                          : "Not selected",
                    )}
                  </Tag>
                ),
              },
              {
                title: translateUi("Dependency"),
                render: (_, row) =>
                  row.package ? `${row.package}${row.version ? ` ${row.version}` : ""}` : "—",
              },
              {
                title: translateUi("Prepared"),
                render: (_, row) =>
                  translateUi(
                    row.dependencyApplicable === false
                      ? "Not applicable"
                      : row.prepared
                        ? "Ready"
                        : "Not verified",
                  ),
              },
              {
                title: translateUi("Usage evidence"),
                render: (_, row) => (
                  <div>
                    {[
                      ...(row.usageEvidence?.length
                        ? row.usageEvidence
                        : [row.browserLoaded ? "Browser loaded" : "Not runtime-verified"]),
                      ...(row.ecosystem === "npm" &&
                      !row.codeUsage?.length &&
                      !row.usageEvidence?.includes("Render validated")
                        ? ["Code usage unverified"]
                        : []),
                    ].map((evidence) => (
                      <Tag
                        key={evidence}
                        color={
                          evidence === "Code API usage found"
                            ? "blue"
                            : [
                                  "Not runtime-verified",
                                  "Code usage unverified",
                                  "Browser loaded",
                                  "Runtime version observed",
                                ].includes(evidence)
                              ? undefined
                              : "green"
                        }
                      >
                        {translateUi(evidence)}
                      </Tag>
                    ))}
                    {Boolean(row.codeUsage?.length) && (
                      <details>
                        <summary>{translateUi("Code locations")}</summary>
                        {row.codeUsage?.map((usage) => (
                          <div key={`${usage.file}:${usage.line}:${usage.column}`}>
                            <Typography.Text code>
                              {usage.file}:{usage.line}:{usage.column}
                            </Typography.Text>
                            <Typography.Text code>{usage.expression}</Typography.Text>
                          </div>
                        ))}
                      </details>
                    )}
                  </div>
                ),
              },
              { title: translateUi("Purpose"), dataIndex: "purpose" },
            ]}
          />
        </div>
      ))}
    </section>
  );
}
