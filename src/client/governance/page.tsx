import type { Style } from "../../shared/contracts";
import { GovernanceProjectSelect } from "./project-select";
import { formatGovernanceCost } from "./format-cost";
import { settingsCheckActivity } from "../../shared/settings-check-accounting";
import { ProjectTechnologyExplorer } from "./technology-explorer";
import { SettingsChecks } from "./settings-checks";
import { LoadingStatus } from "../components/loading-status";
import { normalizeSubtitleFields } from "../../shared/subtitle-compatibility";
import { hasOnScreenSubtitles } from "../../shared/script-items";
import { creativeApproachLabel } from "../../shared/creative-approach";
import { buildRouteLabel, buildRouteOf } from "../../shared/build-route";
import { PromptText } from "../components/style-mention";
import { uiLanguage, translateUi, useUiLanguage } from "../i18n";
import { PageTemplate } from "../components/page-template";
import { Button, Card, Collapse, Statistic, Table, Tag, Alert, Input, Pagination } from "antd";
import { GovernanceUsageTable } from "./usage-table";
import { ModelPromptBrowser } from "./model-prompts";
import { aggregateModels } from "../../shared/governance";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { GovernanceReport } from "../../shared/governance";

const date = (value: string | null) =>
  value ? uiLanguage.date(value) : translateUi("Not finished / not recorded");
const duration = (ms: number) =>
  translateUi("{{hours}}h {{minutes}}m {{seconds}}s", {
    hours: Math.floor(ms / 3600000),
    minutes: Math.floor(ms / 60000) % 60,
    seconds: Math.floor(ms / 1000) % 60,
  });

export function GovernancePage({ styles = [] }: { styles?: Pick<Style, "id" | "name_en">[] }) {
  useUiLanguage();
  const [report, setReport] = useState<GovernanceReport>();
  const [selected, setSelected] = useState("all");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [checksPage, setChecksPage] = useState(1);
  const [checksPageSize, setChecksPageSize] = useState(10);
  const [checksSearch, setChecksSearch] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const query = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
          search,
          checksPage: String(checksPage),
          checksPageSize: String(checksPageSize),
          checksSearch,
        });
        if (selected !== "all") query.set("projectId", selected);
        const response = await fetch(`/api/admin/governance?${query}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw Error(translateUi("Unable to load governance data."));
        setReport(normalizeSubtitleFields(await response.json()));
        setError("");
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
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
  }, [revision, page, pageSize, search, selected, checksPage, checksPageSize, checksSearch]);
  if (!report)
    return (
      <PageTemplate
        eyebrow="Admin / AI governance"
        title={translateUi("AI governance")}
        description={<p>{translateUi("Project inputs, responsibilities, usage and spend.")}</p>}
      >
        {error ? (
          <div role="status">{error}</div>
        ) : (
          <LoadingStatus text={translateUi("Loading governance…")} />
        )}
      </PageTemplate>
    );
  const projects = report.projects.filter(
    (project) => selected === "all" || project.id === selected,
  );
  const checks = (report.settingsChecks ?? []).filter(
    (check) => selected === "all" || check.runId === selected,
  );
  const activity = [
    ...projects.flatMap((project) => project.activity),
    ...checks.map(settingsCheckActivity),
  ];
  const totalTools = activity.reduce((sum, row) => sum + row.tools, 0);
  const totalTokens = activity.reduce(
    (sum, row) => sum + (row.inputTokens || 0) + (row.outputTokens || 0),
    0,
  );
  const totalCost = activity.reduce((sum, row) => sum + (row.costLow || 0), 0);
  return (
    <PageTemplate
      className="governance-page governance-ant"
      eyebrow="Admin / AI governance"
      title={translateUi("AI governance")}
      description={<p>{translateUi("Project inputs, responsibilities, usage and spend.")}</p>}
      actions={
        <Button icon={<RefreshCw size={16} />} onClick={() => setRevision((n) => n + 1)}>
          {translateUi("Refresh")}
        </Button>
      }
      controls={
        <div className="governance-filter">
          <Input.Search
            aria-label={translateUi("Search projects")}
            placeholder={translateUi("Search project title or idea")}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            allowClear
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
              setSelected("all");
            }}
          />
          <GovernanceProjectSelect
            value={selected}
            selectedProject={report.projects.find((project) => project.id === selected)}
            onChange={(value) => {
              setSelected(value);
              setSearch("");
              setSearchInput("");
              setPage(1);
              setChecksPage(1);
            }}
          />
          <span>
            {translateUi("Updated") + " "}
            {date(report.generatedAt)}
            {" " + translateUi("· refreshes every 10s")}
          </span>
        </div>
      }
    >
      {error && <Alert type="error" title={error} showIcon />}
      <p>
        {translateUi("Usage and cost totals below cover only the loaded project and check pages.")}
      </p>
      <div className="governance-stats">
        <Card size="small">
          <Statistic title={translateUi("Projects")} value={projects.length} />
        </Card>
        <Card size="small">
          <Statistic title={translateUi("Recorded tool calls")} value={totalTools} />
        </Card>
        <Card size="small">
          <Statistic title={translateUi("Recorded tokens")} value={totalTokens} />
        </Card>
        <Card size="small">
          <Statistic
            title={translateUi("Known cost subtotal · USD")}
            value={totalCost}
            formatter={(value) => formatGovernanceCost(Number(value))}
            suffix="+"
          />
        </Card>
      </div>
      <SettingsChecks
        records={report.settingsChecks ?? []}
        pagination={report.checksPagination}
        onPage={(page, size) => {
          setChecksPage(page);
          setChecksPageSize(size);
        }}
        onSearch={(value) => {
          setChecksSearch(value);
          setChecksPage(1);
        }}
      />
      <Card title={translateUi("Model responsibilities")} className="governance-ant-card">
        <Table
          dataSource={report.models}
          rowKey="function"
          pagination={false}
          size="small"
          scroll={{ x: 700 }}
          columns={[
            {
              title: translateUi("Function"),
              dataIndex: "function",
              render: (value: string) => translateUi(value),
            },
            {
              title: translateUi("Claude selection"),
              dataIndex: "claude",
              render: (value: string) => translateUi(value),
            },
            {
              title: translateUi("GPT selection"),
              dataIndex: "codex",
              render: (value: string) => translateUi(value),
            },
          ]}
        />
        <p className="governance-table-note">
          {translateUi(
            "Configured routing above; actual model IDs appear in each project's activity below. Render/export runs locally without an AI model.",
          )}
        </p>
      </Card>
      <Card
        title={translateUi("Usage by model · selected projects")}
        className="governance-ant-card"
      >
        <GovernanceUsageTable rows={aggregateModels(activity)} styles={styles} />
      </Card>
      {report.pagination && (
        <Pagination
          current={report.pagination.page}
          pageSize={report.pagination.pageSize}
          total={report.pagination.total}
          showSizeChanger
          pageSizeOptions={[5, 10, 25]}
          onChange={(page, size) => {
            setPage(page);
            setPageSize(size);
          }}
        />
      )}
      {projects.length === 0 && <p>{translateUi("No projects recorded yet.")}</p>}
      {projects.map((project) => (
        <Card
          key={project.id}
          data-project-id={project.id}
          className="governance-panel governance-ant-card"
          title={
            <span className="governance-ant-project-title" title={project.name}>
              {project.name}
            </span>
          }
          extra={
            <Tag
              color={
                project.status === "ready"
                  ? "success"
                  : project.status === "failed"
                    ? "error"
                    : "processing"
              }
            >
              {translateUi(project.status)}
            </Tag>
          }
        >
          <ProjectTechnologyExplorer projectId={project.id} jobs={project.technologyJobs ?? []} />
          <dl className="governance-timing">
            <div>
              <dt>{translateUi("Started")}</dt>
              <dd>{date(project.started)}</dd>
            </div>
            <div>
              <dt>{translateUi("Finished")}</dt>
              <dd>{date(project.finished)}</dd>
            </div>
            <div>
              <dt>{translateUi("Total duration")}</dt>
              <dd>
                {project.durationMs === null
                  ? translateUi("Not recorded")
                  : duration(project.durationMs)}
                {project.finished
                  ? ""
                  : ["ready", "failed", "cancelled", "interrupted"].includes(project.status)
                    ? translateUi(" · incomplete timing")
                    : translateUi(" · elapsed")}
              </dd>
            </div>
          </dl>
          {project.incompleteHistory && (
            <p className="governance-note">
              {translateUi(
                "Historical record: some function/model attribution or usage was not captured. Counts cover recorded activity only.",
              )}
            </p>
          )}
          <Collapse
            className="governance-ant-sections"
            defaultActiveKey={projects.length === 1 ? ["inputs", "usage"] : ["usage"]}
            items={[
              {
                key: "inputs",
                label: translateUi("User input and settings"),
                children: (
                  <div className="governance-subsection-body">
                    <h3>{translateUi("Instructions")}</h3>
                    <p className="governance-copy">
                      <PromptText>{project.request.instructions}</PromptText>
                    </p>
                    {project.request.requirements && (
                      <>
                        <h3>{translateUi("Music / instrumental requirements")}</h3>
                        <p className="governance-copy">
                          <PromptText>
                            {project.request.requirements.music.instructions || translateUi("None")}
                          </PromptText>
                        </p>
                        <h3>{translateUi("Image requirements")}</h3>
                        <p className="governance-copy">
                          <PromptText>
                            {project.request.requirements.images.instructions ||
                              translateUi("None")}
                          </PromptText>
                        </p>
                        <h3>{translateUi("URL requirements")}</h3>
                        <p className="governance-copy">
                          <PromptText>
                            {project.request.requirements.urls.instructions || translateUi("None")}
                          </PromptText>
                        </p>
                      </>
                    )}
                    <dl className="governance-settings">
                      <div>
                        <dt>{translateUi("Output")}</dt>
                        <dd>
                          {project.request.outputType === "page"
                            ? translateUi("Interactive HTML")
                            : translateUi("Video")}
                        </dd>
                      </div>
                      <div>
                        <dt>{translateUi("Provider")}</dt>
                        <dd>{project.request.provider}</dd>
                      </div>
                      <div>
                        <dt>{translateUi("Build route")}</dt>
                        <dd>{translateUi(buildRouteLabel(project.request))}</dd>
                      </div>
                      {buildRouteOf(project.request) === "automatic-previews" && (
                        <div>
                          <dt>{translateUi("Creative approach")}</dt>
                          <dd>{translateUi(creativeApproachLabel(project.request))}</dd>
                        </div>
                      )}
                      <div>
                        <dt>{translateUi("Preview options")}</dt>
                        <dd>{project.request.candidateCount}</dd>
                      </div>
                      <div>
                        <dt>{translateUi("Primary Motion Graphic")}</dt>
                        <dd>{project.request.pinnedStyleId || translateUi("Automatic")}</dd>
                      </div>
                      {project.request.outputType === "page" ? (
                        <div>
                          <dt>{translateUi("Viewport")}</dt>
                          <dd>{project.request.viewport}</dd>
                        </div>
                      ) : (
                        <>
                          <div>
                            <dt>{translateUi("Duration")}</dt>
                            <dd>
                              {project.request.duration === "auto"
                                ? translateUi("Auto")
                                : `${project.request.duration}s`}
                            </dd>
                          </div>
                          <div>
                            <dt>{translateUi("Aspect ratio")}</dt>
                            <dd>{project.request.aspectRatio}</dd>
                          </div>
                          <div>
                            <dt>{translateUi("Subtitles")}</dt>
                            <dd>
                              {project.request.scriptItems !== undefined
                                ? translateUi(
                                    hasOnScreenSubtitles(project.request)
                                      ? "Timed script items"
                                      : "Off",
                                  )
                                : project.request.subtitles?.mode === "provided"
                                  ? translateUi("User supplied")
                                  : project.request.subtitles?.mode === "write"
                                    ? translateUi("Generate")
                                    : translateUi("Off")}
                            </dd>
                          </div>
                        </>
                      )}
                    </dl>
                    {project.request.outputType !== "page" &&
                      project.request.subtitles?.mode === "provided" && (
                        <>
                          <h3>{translateUi("Supplied subtitles")}</h3>
                          <p className="governance-copy">
                            <PromptText>{project.request.subtitles.text}</PromptText>
                          </p>
                        </>
                      )}
                    <h3>{translateUi("URLs")}</h3>
                    {project.request.urls.length ? (
                      <ul>
                        {project.request.urls.map((url) => (
                          <li key={url}>{url}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>{translateUi("None")}</p>
                    )}
                    <h3>{translateUi("Attachments")}</h3>
                    {project.attachments.length ? (
                      <ul>
                        {project.attachments.map((asset, i) => (
                          <li key={i}>
                            {asset.name} · {translateUi(asset.kind)} ·{" "}
                            {asset.bytes.toLocaleString()}
                            {" " + translateUi("bytes")}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>{translateUi("None")}</p>
                    )}
                    <h3>{translateUi("Candidate Motion Graphics")}</h3>
                    <p>
                      {project.selectedStyles.map((name) => translateUi(name)).join(" · ") ||
                        translateUi("Not selected yet")}
                    </p>
                  </div>
                ),
              },
              {
                key: "prompts",
                label: translateUi("Model prompts · {{value0}} prompts", {
                  value0: (project.prompts || []).length,
                }),
                children: (
                  <div className="governance-subsection-body">
                    <ModelPromptBrowser projectId={project.id} prompts={project.prompts || []} />
                  </div>
                ),
              },
              {
                key: "usage",
                label: translateUi("Usage by model and function"),
                children: (
                  <div className="governance-subsection-body">
                    <GovernanceUsageTable
                      styles={styles}
                      rows={[
                        ...project.activity,
                        ...checks
                          .filter((check) => check.runId === project.id)
                          .map(settingsCheckActivity),
                      ]}
                      byFunction
                    />
                  </div>
                ),
              },
            ]}
          />
        </Card>
      ))}
      <Card title={translateUi("Accounting notes")} className="governance-ant-card">
        <p>
          {translateUi(
            "Duration is wall-clock time from project creation to the latest completed phase, including waits and retries. Input totals include cache reads/writes; cached input is a subset. Tool starts, updates and results count once per unique tool ID. Invocations are SDK turns, not individual API requests. Failed or cancelled invocations may lack a final usage report. Cache reads and cache writes are input tokens. Cache-write durations are shown when returned by the SDK; missing values remain unknown. Output tokens have no separate cache category.",
          )}
        </p>
        <p>
          {translateUi(
            "Claude costs use SDK-reported amounts. Codex costs use standard short-context API rates on new thread usage; cached reads and writes are separated from input, and reasoning is included in output. Cumulative costs and token counters are differenced across resumed sessions to avoid double-counting. Codex estimates do not infer long-context, cache-duration or service-tier premiums from aggregate tokens. Other costs remain unavailable unless reported. Totals include retained project records only.",
          )}
        </p>
        <p>
          {translateUi("Rates checked") + " "}
          {report.pricingDate}:{" "}
          {report.pricingSources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              {translateUi(source.label)}
            </a>
          ))}
        </p>
      </Card>
    </PageTemplate>
  );
}
