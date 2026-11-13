import { Button, Tooltip } from "antd";
import { ExternalLink } from "lucide-react";
import type { GenerationJob } from "../../../shared/contracts";
import { translateUi, useUiLanguage } from "../../i18n";

/** Use the sandboxed page route rather than the downloadable artifact route. */
export function OpenPageButton({ job }: { job: GenerationJob }) {
  useUiLanguage();
  if (job.outputType !== "page" || job.phase !== "ready" || !job.page) return null;
  const label = translateUi("Open interactive page");
  return (
    <Tooltip title={label} trigger={["hover", "focus"]}>
      <Button
        className="secondary delivery-icon-button project-page-open"
        href={`/api/pages/${encodeURIComponent(job.runId)}/${encodeURIComponent(job.id)}/index.html`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        icon={<ExternalLink size={18} aria-hidden="true" />}
      />
    </Tooltip>
  );
}
