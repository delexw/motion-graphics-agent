import { Check } from "lucide-react";
import type { GenerationJob } from "../../shared/contracts";
import { translateUi, useUiLanguage } from "../i18n";
import "./selected-direction.css";

/** The saved winner identifies the chosen preview, including while its full film is building. */
export function SelectedDirection({
  winnerId,
  job,
}: {
  winnerId?: string;
  job: Pick<GenerationJob, "kind" | "candidateId">;
}) {
  useUiLanguage();
  if (job.kind !== "preview" || !winnerId || job.candidateId !== winnerId) return null;
  return (
    <span
      className="selected-direction-badge"
      role="status"
      aria-label={translateUi("Selected direction")}
      title={translateUi("Selected direction")}
    >
      <Check size={14} aria-hidden="true" />
    </span>
  );
}
