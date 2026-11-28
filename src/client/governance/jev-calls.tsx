import { Pagination, Typography } from "antd";
import { useState } from "react";
import type { JevCallDetail } from "../../shared/jev-call-accounting";
import { translateUi, uiLanguage } from "../i18n";
import { formatGovernanceCost } from "./format-cost";
import { governanceEffortLabel } from "./model-effort";
import { JevDashboardCard } from "./jev-dashboard-card";

const statusLabels: Record<JevCallDetail["status"], string> = {
  recorded: "Usage recorded",
  pending: "No final result recorded",
  failed: "failed",
  cancelled: "cancelled",
  compatible: "Compatible",
  conflict: "Conflicts found",
};

const callsPerPage = 10;
const backgroundTreatmentLabels = {
  required: "Layered background required",
  not_required: "Layered background not required",
  both: "Layered and simple backgrounds",
} as const;

export function GovernanceJevCalls({ calls }: { calls: JevCallDetail[] }) {
  const [requestedPage, setPage] = useState(1);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(calls.length / callsPerPage)));
  return (
    <section aria-label={translateUi("JEV calls")} className="governance-jev-calls">
      {calls.slice((page - 1) * callsPerPage, page * callsPerPage).map((call) => (
        <JevDashboardCard
          key={`${call.purpose}|${call.id}`}
          className="governance-jev-call"
          title={translateUi(call.purpose)}
        >
          <div className="governance-table-detail">
            {call.project && `${call.project} · `}
            {uiLanguage.date(call.time)}
          </div>
          {call.backgroundTarget && (
            <div className="governance-table-detail">
              {[
                translateUi(
                  call.backgroundTarget.kind === "full"
                    ? "Full film"
                    : call.backgroundTarget.directions.length > 1
                      ? "Preview directions"
                      : "Preview",
                ),
                call.backgroundTarget.version && `v${call.backgroundTarget.version}`,
                call.backgroundTarget.directions.join(" / "),
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
          {call.promptUrl && (
            <a href={call.promptUrl} target="_blank" rel="noreferrer">
              {translateUi("Recorded call input")}
            </a>
          )}
          <dl className="governance-jev-metric-grid governance-jev-call-metrics">
            <div>
              <dt>{translateUi("Status")}</dt>
              <dd>
                {translateUi(statusLabels[call.status])}
                {call.targetModel && <div>{call.targetModel}</div>}
                {call.selectedEffort && (
                  <div>
                    {translateUi("Selected effort:")} {governanceEffortLabel(call.selectedEffort)}
                  </div>
                )}
                {call.backgroundTreatment && (
                  <div>{translateUi(backgroundTreatmentLabels[call.backgroundTreatment])}</div>
                )}
              </dd>
            </div>
            <div>
              <dt>{translateUi("Input tokens")}</dt>
              <dd>{call.inputTokens?.toLocaleString() ?? translateUi("Not recorded")}</dd>
            </div>
            <div>
              <dt>{translateUi("Output tokens")}</dt>
              <dd>{call.outputTokens?.toLocaleString() ?? translateUi("Not recorded")}</dd>
            </div>
            <div>
              <dt>{translateUi("Estimated USD")}</dt>
              <dd>
                {call.cost === null ? translateUi("Unavailable") : formatGovernanceCost(call.cost)}
                <div>
                  <Typography.Text type="secondary">{translateUi(call.costBasis)}</Typography.Text>
                </div>
              </dd>
            </div>
          </dl>
        </JevDashboardCard>
      ))}
      <Pagination
        align="end"
        current={page}
        pageSize={callsPerPage}
        total={calls.length}
        showSizeChanger={false}
        hideOnSinglePage
        onChange={setPage}
      />
    </section>
  );
}
