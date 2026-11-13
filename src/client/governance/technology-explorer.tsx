import { useEffect, useId, useState } from "react";
import { Alert, Collapse, Empty, Input, Select, Spin, Typography } from "antd";
import type { ProjectTechnologyMonitor } from "../../shared/project-technologies";
import { translateUi } from "../i18n";
import { ProjectTechnologies } from "./project-technologies";

type Job = { id: string; kind: string; phase: string };
function JobTechnologies({ projectId, jobs }: { projectId: string; jobs: Job[] }) {
  const [chosenJob, setChosenJob] = useState("");
  const jobId =
    chosenJob ||
    jobs.find((job) => !["ready", "failed", "cancelled", "interrupted"].includes(job.phase))?.id ||
    jobs[0]?.id;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState("all");
  const [report, setReport] = useState<ProjectTechnologyMonitor>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const query = new URLSearchParams({
          jobId,
          page: String(page),
          pageSize: String(pageSize),
          search,
          selection,
        });
        const response = await fetch(
          `/api/admin/governance/${encodeURIComponent(projectId)}/technologies?${query}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw Error(translateUi("Unable to load technology records."));
        setReport(await response.json());
        setError("");
      } catch (error) {
        if (!controller.signal.aborted) setError((error as Error).message);
      } finally {
        loading = false;
      }
    };
    void load();
    const timer = setInterval(load, 10000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [projectId, jobId, page, pageSize, search, selection]);
  const fieldId = useId();
  const jobFieldId = `${fieldId}-job`;
  const searchFieldId = `${fieldId}-search`;
  const selectionFieldId = `${fieldId}-selection`;
  return (
    <div className="technology-explorer">
      {jobId && (
        <div
          className="technology-explorer__toolbar"
          role="group"
          aria-label={translateUi("Technology filters")}
        >
          <div className="technology-explorer__field">
            <label htmlFor={jobFieldId} className="technology-explorer__label">
              <Typography.Text type="secondary">{translateUi("Job")}</Typography.Text>
            </label>
            <Select
              id={jobFieldId}
              className="technology-explorer__control"
              popupMatchSelectWidth={false}
              value={jobId}
              options={jobs.map((job) => ({
                value: job.id,
                label: `${translateUi(job.kind)} · ${job.id.slice(0, 8)}`,
              }))}
              onChange={(id) => {
                setChosenJob(id);
                setPage(1);
                setReport(undefined);
              }}
            />
          </div>
          <div className="technology-explorer__field technology-explorer__field--search">
            <label htmlFor={searchFieldId} className="technology-explorer__label">
              <Typography.Text type="secondary">{translateUi("Search")}</Typography.Text>
            </label>
            <Input.Search
              id={searchFieldId}
              className="technology-explorer__control"
              placeholder={translateUi("Search technology name or ID")}
              allowClear
              onSearch={(value) => {
                setSearch(value);
                setPage(1);
              }}
            />
          </div>
          <div className="technology-explorer__field">
            <label htmlFor={selectionFieldId} className="technology-explorer__label">
              <Typography.Text type="secondary">{translateUi("Selection")}</Typography.Text>
            </label>
            <Select
              id={selectionFieldId}
              className="technology-explorer__control"
              value={selection}
              options={[
                { value: "all", label: translateUi("All technologies") },
                { value: "selected", label: translateUi("Selected") },
                { value: "not_selected", label: translateUi("Not selected") },
              ]}
              onChange={(value) => {
                setSelection(value);
                setPage(1);
              }}
            />
          </div>
        </div>
      )}
      {error && <Alert type="error" showIcon title={error} />}
      {report ? (
        <ProjectTechnologies
          embedded
          jobs={[report]}
          onPage={(page, size) => {
            setPage(page);
            setPageSize(size);
          }}
        />
      ) : !jobId ? (
        <div role="status" className="technology-explorer__state">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={translateUi("No jobs recorded yet.")}
          />
        </div>
      ) : error ? null : (
        <div role="status" className="technology-explorer__state">
          <Spin size="small" />
          <Typography.Text type="secondary">
            {translateUi("Loading technology records…")}
          </Typography.Text>
        </div>
      )}
    </div>
  );
}
/** Show current-page evidence by default; stop polling when the panel closes. */
export function ProjectTechnologyExplorer(props: { projectId: string; jobs: Job[] }) {
  return (
    <Collapse
      defaultActiveKey={["technologies"]}
      destroyOnHidden
      items={[
        {
          key: "technologies",
          label: translateUi("Project technologies"),
          children: <JobTechnologies {...props} />,
        },
      ]}
    />
  );
}
