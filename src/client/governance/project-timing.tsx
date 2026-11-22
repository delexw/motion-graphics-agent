import type { GovernanceProject } from "../../shared/governance";
import { translateUi, uiLanguage } from "../i18n";

export function GovernanceProjectTiming({
  project,
}: {
  project: Pick<GovernanceProject, "started" | "finished" | "durationMs">;
}) {
  const { started, finished, durationMs } = project;
  const total =
    durationMs === null
      ? translateUi("Not recorded")
      : translateUi("{{hours}}h {{minutes}}m {{seconds}}s", {
          hours: Math.floor(durationMs / 3600000),
          minutes: Math.floor(durationMs / 60000) % 60,
          seconds: Math.floor(durationMs / 1000) % 60,
        });

  return (
    <dl className="governance-timing" aria-label={translateUi("Project timing")}>
      <div>
        <dt>{translateUi("Started")}</dt>
        <dd>{uiLanguage.date(started)}</dd>
      </div>
      <div>
        <dt>{translateUi("Finished")}</dt>
        <dd>
          {finished
            ? uiLanguage.date(finished)
            : translateUi(durationMs === null ? "Not recorded" : "In progress")}
        </dd>
      </div>
      <div>
        <dt>{translateUi("Total duration")}</dt>
        <dd>
          {total}
          {!finished && durationMs !== null ? translateUi(" · elapsed") : ""}
        </dd>
      </div>
    </dl>
  );
}
