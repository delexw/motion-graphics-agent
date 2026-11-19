import { jobDownloadBasename } from "../../shared/job-download-name";
import { useEffect, useState } from "react";
import { FolderArchive } from "lucide-react";
import { Typography } from "antd";
import { DownloadIconButton } from "./download-icon-button";
import { translateUi, useUiLanguage } from "../i18n";
import { terminalPhases, type GenerationJob, type Run } from "../../shared/contracts";

export function ProjectDownload({ run, job }: { run: Run; job: GenerationJob }) {
  useUiLanguage();
  const [available, setAvailable] = useState<boolean>();
  const url = `/api/projects/${run.id}/${job.id}`;
  useEffect(() => {
    const controller = new AbortController();
    setAvailable(undefined);
    const check = async () => {
      try {
        const response = await fetch(`${url}/availability`, { signal: controller.signal });
        const body = response.ok ? await response.json() : { available: false };
        if (!controller.signal.aborted) setAvailable(body.available === true);
      } catch {
        if (!controller.signal.aborted) setAvailable(false);
      }
    };
    void check();
    const timer = setInterval(
      () => {
        void check();
      },
      terminalPhases.has(job.phase) ? 15000 : 5000,
    );
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [url, job.phase]);
  return available ? (
    <DownloadIconButton
      href={url}
      download={`${jobDownloadBasename(run, job)}.zip`}
      icon={<FolderArchive size={18} aria-hidden="true" />}
      label={translateUi("Download editable project")}
    />
  ) : (
    <Typography.Text type="secondary">
      {translateUi(
        available === undefined
          ? "Checking editable project files…"
          : "Editable project files are currently unavailable.",
      )}
    </Typography.Text>
  );
}
