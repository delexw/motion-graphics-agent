import { Collapse, Flex, Statistic, Tag, Typography } from "antd";
import type { ModelActivity } from "../../shared/governance";
import type { JevCallDetail } from "../../shared/jev-call-accounting";
import type { Style } from "../../shared/contracts";
import {
  requestSettingLabels,
  type SettingsCheckRecord,
} from "../../shared/request-settings-review";
import { settingValueText } from "../components/settings-conflict-notice";
import { translateUi, uiLanguage } from "../i18n";
import { GovernanceJevCalls } from "./jev-calls";
import { GovernanceCombinationEvaluation } from "./combination-comparison";

import { formatJevPercent, JevDashboardCard } from "./jev-dashboard-card";
import { SettingsCheckStatus } from "./settings-check-status";

type JevDetailVariant =
  | { kind: "render-cache"; reviews: NonNullable<ModelActivity["renderCacheReviews"]> }
  | { kind: "combination"; evaluation: NonNullable<ModelActivity["combinationEvaluation"]> }
  | { kind: "authoring"; selections: NonNullable<ModelActivity["authoringSelections"]> }
  | { kind: "settings-check"; check: SettingsCheckRecord };

export function jevUsageVariants(row: ModelActivity): JevDetailVariant[] {
  return [
    ...(row.renderCacheReviews?.length
      ? [{ kind: "render-cache" as const, reviews: row.renderCacheReviews }]
      : []),
    ...(row.combinationEvaluation
      ? [{ kind: "combination" as const, evaluation: row.combinationEvaluation }]
      : []),
    ...(row.authoringSelections?.length
      ? [{ kind: "authoring" as const, selections: row.authoringSelections }]
      : []),
  ];
}

export function GovernanceJevDetails({
  calls,
  variants = [],
  styles = [],
}: {
  calls?: JevCallDetail[];
  variants?: JevDetailVariant[];
  styles?: Pick<Style, "id" | "name_en">[];
}) {
  if (!calls?.length && !variants.length) return null;
  const displayStyles = styles.map(({ id, name_en }) => ({ id, name_en: translateUi(name_en) }));
  return (
    <div className="governance-row-details">
      {variants.map((variant) => {
        switch (variant.kind) {
          case "render-cache":
            return (
              <Flex vertical gap={12} key={variant.kind}>
                {variant.reviews.map((review) => (
                  <RenderCacheReviewCard key={review.id} review={review} />
                ))}
              </Flex>
            );
          case "combination":
            return (
              <GovernanceCombinationEvaluation
                key={variant.kind}
                evaluation={variant.evaluation}
                styles={displayStyles}
              />
            );
          case "authoring":
            return (
              <Flex vertical gap={12} key={variant.kind}>
                {variant.selections.map((selection) => (
                  <AuthoringSelectionCard key={selection.jobId} selection={selection} />
                ))}
              </Flex>
            );
          case "settings-check":
            return <SettingsCheckCard key={variant.kind} check={variant.check} />;
        }
      })}
      {calls?.length ? (
        variants.length > 0 ? (
          <Collapse
            size="small"
            className="governance-jev-call-details"
            items={[
              {
                key: "calls",
                label: `${translateUi("JEV calls")} · ${calls.length}`,
                children: <GovernanceJevCalls calls={calls} />,
              },
            ]}
          />
        ) : (
          <GovernanceJevCalls calls={calls} />
        )
      ) : null}
    </div>
  );
}

function RenderCacheReviewCard({
  review,
}: {
  review: NonNullable<ModelActivity["renderCacheReviews"]>[number];
}) {
  const reuse = translateUi("Reuse cached shot");
  const rebuild = translateUi("Rebuild shot");
  const choice =
    review.choice === "reuse"
      ? reuse
      : review.choice === "refresh"
        ? rebuild
        : translateUi("Not recorded");
  return (
    <section aria-label={translateUi("Render cache review")}>
      <JevDashboardCard
        title={review.shot || translateUi("Render cache review")}
        details={[
          {
            key: "review",
            label: translateUi("Review details"),
            children: (
              <Flex vertical gap={8}>
                <div className="governance-jev-metric-grid">
                  <Statistic title={reuse} value={formatJevPercent(review.probabilities.reuse)} />
                  <Statistic
                    title={rebuild}
                    value={formatJevPercent(review.probabilities.refresh)}
                  />
                </div>
                {review.summary && (
                  <Typography.Text className="governance-jev-reading-text">
                    {review.summary}
                  </Typography.Text>
                )}
                {review.renderImpact && (
                  <Typography.Text className="governance-jev-reading-text">
                    {review.renderImpact}
                  </Typography.Text>
                )}
              </Flex>
            ),
          },
        ]}
      >
        {review.direction && (
          <Typography.Text type="secondary">
            {review.direction} · {translateUi("Version {{value0}}", { value0: review.version })}
          </Typography.Text>
        )}
        <Flex wrap align="baseline" gap={6}>
          <Typography.Text type="secondary">{translateUi("JEV decision")}</Typography.Text>
          <Tag color={review.choice === "reuse" ? "success" : undefined}>{choice}</Tag>
        </Flex>
        <Statistic
          title={translateUi("Choice certainty")}
          value={formatJevPercent(review.confidence)}
        />
        {review.uncertain && (
          <Typography.Text type="warning" className="governance-jev-reading-text">
            {translateUi("The change brief is uncertain; cached footage cannot be reused.")}
          </Typography.Text>
        )}
        <a href={review.promptUrl} target="_blank" rel="noreferrer">
          {translateUi("Recorded review input")} · {uiLanguage.date(review.time)}
        </a>
      </JevDashboardCard>
    </section>
  );
}

function AuthoringSelectionCard({
  selection,
}: {
  selection: NonNullable<ModelActivity["authoringSelections"]>[number];
}) {
  const selected = selection.resources.filter((resource) => resource.selected);
  const alternatives = selection.resources.filter((resource) => !resource.selected);
  const kind = translateUi(selection.kind === "preview" ? "Preview" : "Full film");
  return (
    <section aria-label={translateUi("Authoring comparison")}>
      <JevDashboardCard
        title={selection.direction ? `${kind} · ${selection.direction}` : kind}
        details={
          alternatives.length
            ? [
                {
                  key: "alternatives",
                  label: translateUi("Alternatives compared"),
                  children: (
                    <Flex wrap gap={6}>
                      {alternatives.map((resource) => (
                        <Tag key={resource.id}>
                          {translateUi(resource.name)} · {formatJevPercent(resource.probability)}
                        </Tag>
                      ))}
                    </Flex>
                  ),
                },
              ]
            : undefined
        }
      >
        <Flex wrap gap={6} align="baseline" role="group" aria-label={translateUi("Selected")}>
          <Typography.Text type="secondary">{translateUi("Selected")}</Typography.Text>
          {selected.length ? (
            selected.map((resource) => (
              <Tag key={resource.id} color="processing">
                {translateUi(resource.name)} · {formatJevPercent(resource.probability)}
              </Tag>
            ))
          ) : (
            <Typography.Text>{translateUi("None")}</Typography.Text>
          )}
        </Flex>
      </JevDashboardCard>
    </section>
  );
}

function SettingsCheckCard({ check }: { check: SettingsCheckRecord }) {
  return (
    <JevDashboardCard
      className="governance-settings-check-card"
      title={translateUi("Request/settings compatibility check")}
      details={[
        {
          key: "events",
          label: translateUi("Recorded check data"),
          children: (
            <Flex vertical gap={8}>
              <Typography.Text type="secondary">
                {translateUi("Draft / project")}: {check.draftId ?? "—"} / {check.runId ?? "—"}
              </Typography.Text>
              <Typography.Text className="governance-jev-reading-text">
                {translateUi(
                  "Recorded JEV input, response and usage. Internal provider prompts are not exposed; absent usage is not zero usage.",
                )}
              </Typography.Text>
              <pre className="governance-jev-raw-events">
                {JSON.stringify(check.events, null, 2)}
              </pre>
            </Flex>
          ),
        },
      ]}
    >
      <Flex wrap gap={6} align="baseline">
        <SettingsCheckStatus status={check.status} />
        <Typography.Text type="secondary">{uiLanguage.date(check.startedAt)}</Typography.Text>
      </Flex>
      {check.review?.conflicts.map((conflict) => (
        <div key={conflict.setting} className="governance-jev-reading-text">
          <strong>
            {translateUi(requestSettingLabels[conflict.setting])}: {settingValueText(conflict)}
          </strong>
          <div>
            {translateUi("Conflicting input")}: {translateUi(conflict.source.label)}
          </div>
        </div>
      ))}
    </JevDashboardCard>
  );
}
