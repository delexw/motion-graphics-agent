import { Collapse, Flex, Statistic, Tag, Typography } from "antd";
import type { Style, StyleCandidate } from "../../shared/contracts";
import type { ModelActivity } from "../../shared/governance";
import { translateUi } from "../i18n";
import { formatJevPercent, JevDashboardCard } from "./jev-dashboard-card";

function GovernanceCombinationStyles({
  styleIds,
  styles,
}: {
  styleIds: readonly string[];
  styles: Pick<Style, "id" | "name_en">[];
}) {
  const [primary, ...supporting] = styleIds;
  const styleName = (id: string) =>
    styles.find((style) => style.id === id)?.name_en || translateUi("Not recorded");
  const primaryLabel = translateUi("Primary Motion Graphic");
  const supportingLabel = translateUi("Supporting Motion Graphics");

  if (!primary) {
    return (
      <Typography.Text type="secondary">
        {translateUi("Combination styles not recorded")}
      </Typography.Text>
    );
  }

  return (
    <Flex vertical gap={4} className="governance-combination-styles">
      <Flex wrap gap={4} align="baseline" role="group" aria-label={primaryLabel}>
        <Typography.Text type="secondary">{primaryLabel}</Typography.Text>
        <Tag color="processing">{styleName(primary)}</Tag>
      </Flex>
      {supporting.length > 0 && (
        <Flex wrap gap={4} align="baseline" role="group" aria-label={supportingLabel}>
          <Typography.Text type="secondary">{supportingLabel}</Typography.Text>
          {supporting.map((id) => (
            <Tag key={id}>{styleName(id)}</Tag>
          ))}
        </Flex>
      )}
    </Flex>
  );
}

function GovernanceCombinationComparison({
  decision,
  styles,
}: {
  decision: StyleCandidate["selectionDecision"];
  styles: Pick<Style, "id" | "name_en">[];
}) {
  if (!decision) {
    return (
      <div>{translateUi("Original choice probabilities were not recorded for this run.")}</div>
    );
  }
  const namedIds = decision.comparedIds.filter((id) => decision.comparedStyles?.[id]?.length);
  const unnamedIds = decision.comparedIds.filter((id) => !decision.comparedStyles?.[id]?.length);
  const preference = (id: string) => formatJevPercent(decision.probabilities[id]);
  return (
    <section aria-label={translateUi("Selection round")}>
      {namedIds.length > 0 && (
        <ul className="governance-comparison-options">
          {namedIds.map((id) => (
            <li key={id}>
              <div className="governance-comparison-option-heading">
                <GovernanceCombinationStyles
                  styleIds={decision.comparedStyles?.[id] ?? []}
                  styles={styles}
                />
                <Typography.Text strong className="governance-comparison-preference">
                  {preference(id)}
                </Typography.Text>
              </div>
            </li>
          ))}
        </ul>
      )}
      {unnamedIds.length > 0 && (
        <Flex
          wrap
          align="baseline"
          gap={6}
          role="group"
          aria-label={translateUi("Combination styles not recorded")}
        >
          <Typography.Text type="secondary">
            {translateUi("Combination styles not recorded")}
          </Typography.Text>
          {unnamedIds.map((id) => (
            <Tag key={id}>{preference(id)}</Tag>
          ))}
        </Flex>
      )}
    </section>
  );
}

export function GovernanceCombinationEvaluation({
  evaluation,
  styles,
}: {
  evaluation: NonNullable<ModelActivity["combinationEvaluation"]>;
  styles: Pick<Style, "id" | "name_en">[];
}) {
  return (
    <section aria-label={translateUi("Combination evaluation")}>
      <Flex vertical gap={12}>
        {evaluation.selected.map((candidate) => {
          const decision = candidate.selectionDecision;
          return (
            <JevDashboardCard
              key={candidate.id}
              className="governance-direction-card"
              title={
                candidate.title && candidate.title !== candidate.id
                  ? candidate.title
                  : translateUi("Selected direction")
              }

              details={[
                ...(candidate.rationale
                  ? [
                      {
                        key: "rationale",
                        label: translateUi("Rationale"),
                        children: (
                          <Typography.Paragraph className="governance-direction-rationale governance-jev-reading-text">
                            {candidate.rationale}
                          </Typography.Paragraph>
                        ),
                      },
                    ]
                  : []),
                {
                  key: "scores",
                  label: translateUi("Score breakdown"),
                  children: (
                    <Flex vertical gap={8}>
                      <Flex wrap gap={8}>
                        {Object.entries(candidate.dimensions).map(([name, value]) => (
                          <Tag key={name}>
                            {translateUi(name)} · {formatJevPercent(value)}
                          </Tag>
                        ))}
                      </Flex>
                      <Typography.Text
                        type="secondary"
                        className="governance-direction-rationale governance-jev-reading-text"
                      >
                        {translateUi(
                          "Choice certainty measures how strongly JEV preferred one option over the others. Near zero means a near tie; it is not the quality score or a success probability.",
                        )}
                      </Typography.Text>
                    </Flex>
                  ),
                },
                {
                  key: "comparison",
                  label: decision
                    ? `${translateUi("Selection round")} · ${decision.round}`
                    : translateUi("Selection round"),
                  children: <GovernanceCombinationComparison decision={decision} styles={styles} />,
                },
              ]}
            >
              <GovernanceCombinationStyles styleIds={candidate.styles} styles={styles} />
              <div className="governance-jev-metric-grid">
                <Statistic
                  title={translateUi("Evaluation score")}
                  value={candidate.score}
                  precision={1}
                  suffix={<Typography.Text type="secondary">/ 100</Typography.Text>}
                />
                {candidate.evaluationConfidence != null && (
                  <Statistic
                    title={translateUi("Evaluation certainty")}
                    value={formatJevPercent(candidate.evaluationConfidence)}
                  />
                )}
                <Statistic
                  title={translateUi("Choice certainty in final comparison")}
                  value={formatJevPercent(candidate.confidence)}
                />
              </div>
            </JevDashboardCard>
          );
        })}
        {evaluation.calls.length > 0 && (
          <Collapse
            size="small"
            items={[
              {
                key: "calls",
                label: translateUi("Recorded evaluation calls"),
                children: (
                  <ol>
                    {evaluation.calls.map((call) => (
                      <li key={call.id}>
                        <a href={call.promptUrl} target="_blank" rel="noreferrer">
                          {call.time}
                        </a>
                      </li>
                    ))}
                  </ol>
                ),
              },
            ]}
          />
        )}
      </Flex>
    </section>
  );
}
