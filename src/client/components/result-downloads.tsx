import { useState } from "react";
import { Button, Flex, Modal, Tooltip } from "antd";
import { Download, FileCode, FileVideo } from "lucide-react";
import type { GenerationJob, Run } from "../../shared/contracts";
import type { LanguageMedia } from "../../shared/language-tracks";
import { translateUi, useUiLanguage } from "../i18n";
import { DownloadIconButton } from "./download-icon-button";
import { CompactVideoOption } from "./compact-video-option";
import { LanguageMediaDownloads } from "./language-media-downloads";
import { ProjectDownload } from "./project-download";

export function ResultDownloads({
  run,
  job,
  originalUrl,
  media,
  downloadName,
}: {
  run: Run;
  job: GenerationJob;
  originalUrl?: string;
  media?: LanguageMedia;
  downloadName: string;
}) {
  useUiLanguage();
  const [open, setOpen] = useState(false);
  const page = job.outputType === "page";
  const archive = `/api/projects/${run.id}/${job.id}`;
  const close = () => setOpen(false);

  return (
    <>
      <Tooltip title={translateUi("Downloads")}>
        <Button
          className="secondary delivery-icon-button"
          aria-label={translateUi("Downloads")}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          icon={<Download size={18} aria-hidden="true" />}
        />
      </Tooltip>
      <Modal
        title={translateUi("Downloads")}
        open={open}
        onCancel={close}
        footer={null}
        centered
        keyboard
        destroyOnHidden
        focusable={{ focusTriggerAfterClose: true }}
        width="min(420px, calc(100vw - 32px))"
        styles={{
          body: {
            maxHeight: "min(65vh, 560px)",
            overflowY: "auto",
            overscrollBehavior: "contain",
          },
        }}
      >
        <Flex vertical gap="middle" align="start">
          {page && job.phase === "ready" ? (
            <DownloadIconButton
              href={archive}
              download={`${downloadName}.zip`}
              icon={<FileCode size={18} aria-hidden="true" />}
              label={translateUi("Download HTML bundle")}
            />
          ) : (
            <>
              <Flex gap="small" align="center" wrap>
                {originalUrl && (
                  <DownloadIconButton
                    href={originalUrl}
                    download={`${downloadName}.mp4`}
                    icon={<FileVideo size={18} aria-hidden="true" />}
                    label={translateUi("Download original MP4")}
                  />
                )}
                {job.kind === "full" && <ProjectDownload run={run} job={job} />}
              </Flex>
              {originalUrl && job.kind === "full" && (
                <CompactVideoOption key={archive} url={`${archive}/compact-video`} />
              )}
              {originalUrl && media && (
                <LanguageMediaDownloads media={media} downloadName={downloadName} />
              )}
            </>
          )}
        </Flex>
      </Modal>
    </>
  );
}
