import { useEffect, useState } from "react";
import { Alert, Select, Typography } from "antd";
import type { GovernanceProjectOption, GovernanceProjectOptions } from "../../shared/governance";
import { translateUi, uiLanguage } from "../i18n";

/** Filtering report rows must never remove the other project options. */
export function GovernanceProjectSelect({
  value,
  selectedProject,
  onChange,
}: {
  value: string;
  selectedProject?: Pick<GovernanceProjectOption, "id" | "name">;
  onChange: (value: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [response, setResponse] = useState<GovernanceProjectOptions>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Pick<GovernanceProjectOption, "id" | "name">>();
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), pageSize: "20", search });
    void fetch(`/api/admin/governance/projects?${query}`, { signal: controller.signal })
      .then(async (result) => {
        if (!result.ok) throw Error(translateUi("Unable to load project options."));
        const body: GovernanceProjectOptions = await result.json();
        if (!controller.signal.aborted) {
          setResponse((previous) =>
            page === 1 || !previous
              ? body
              : {
                  ...body,
                  projects: [
                    ...previous.projects,
                    ...body.projects.filter(
                      (project) => !previous.projects.some((saved) => saved.id === project.id),
                    ),
                  ],
                },
          );
          setError("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError((error as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, page, search]);
  const projects = response?.projects ?? [];
  const retained = selectedProject ?? chosen;
  const options = [
    { value: "all", label: translateUi("All projects"), description: "" },
    ...projects.map((project) => ({
      value: project.id,
      label: project.name,
      description: `${translateUi(project.outputType === "page" ? "HTML" : "Video")} · ${translateUi(project.provider === "claude" ? "Claude" : "GPT")} · ${uiLanguage.date(project.started)} · ${project.id}`,
    })),
  ];
  if (
    value !== "all" &&
    retained?.id === value &&
    !options.some((option) => option.value === value)
  )
    options.push({ value, label: retained.name, description: "" });
  return (
    <Select
      aria-label={translateUi("Governance project")}
      className="governance-ant-select"
      styles={{ popup: { root: { maxWidth: "calc(100vw - 32px)", minWidth: 0 } } }}
      value={value}
      open={open}
      onOpenChange={setOpen}
      loading={loading}
      showSearch={{
        filterOption: false,
        onSearch: (query) => {
          setSearch(query);
          setPage(1);
        },
      }}
      options={options}
      onChange={(id) => {
        setChosen(projects.find((project) => project.id === id));
        onChange(id);
        setSearch("");
        setPage(1);
      }}
      optionRender={(option) => (
        <div className="governance-ant-option" data-project-id={option.value}>
          <div className="governance-ant-option-name" title={option.data.label}>
            {option.data.label}
          </div>
          {option.data.description && <small>{option.data.description}</small>}
        </div>
      )}
      onPopupScroll={(event) => {
        const target = event.currentTarget;
        if (
          !loading &&
          response &&
          response.projects.length < response.pagination.total &&
          target.scrollHeight - target.scrollTop - target.clientHeight <= target.clientHeight
        )
          setPage(response.pagination.page + 1);
      }}
      popupRender={(menu) => (
        <>
          {error && <Alert type="error" title={error} />}
          {menu}
          {response && (
            <div className="governance-project-options-pagination" role="status">
              <Typography.Text type="secondary">
                {translateUi("{{loaded}} of {{total}} projects", {
                  loaded: projects.length,
                  total: response.pagination.total,
                })}
              </Typography.Text>
            </div>
          )}
        </>
      )}
    />
  );
}
