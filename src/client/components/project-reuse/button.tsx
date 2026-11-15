import { useEffect, useState } from "react";
import { Button, Tooltip } from "antd";
import { CopyPlus } from "lucide-react";
import type { GenerationJob, Run, Style } from "../../../shared/contracts";
import { translateUi, useUiLanguage } from "../../i18n";
import { projectReuseSource } from "../../../shared/project-reuse";
import { ProjectReuseDialog } from "./dialog";

export function ProjectReuseButton({
  run,
  job,
  styles,
  previewOpen = false,
  onCreated,
}: {
  previewOpen?: boolean;
  onCreated?: (draftId: string) => void;
  run: Run;
  job: GenerationJob;
  styles: Pick<Style, "id" | "name_en">[];
}) {
  useUiLanguage();
  const [open, setOpen] = useState(previewOpen);
  useEffect(() => {
    if (previewOpen) setOpen(true);
  }, [previewOpen]);
  const source = projectReuseSource(run, job.id);
  if (!source) return null;
  const label = translateUi("New project from this style");
  return (
    <>
      <Tooltip title={label} trigger={["hover", "focus"]}>
        <Button
          className="secondary delivery-icon-button"
          aria-label={label}
          onClick={() => setOpen(true)}
          icon={<CopyPlus size={18} aria-hidden="true" />}
        />
      </Tooltip>
      {open && (
        <ProjectReuseDialog
          key={job.id}
          run={run}
          source={source}
          styles={styles}
          onClose={() => setOpen(false)}
          onCreated={onCreated}
        />
      )}
    </>
  );
}
