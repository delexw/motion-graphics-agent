import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Run } from "../../../shared/contracts";
import { projectName } from "../../../shared/project-name";
import { projectReuseSource } from "../../../shared/project-reuse";
import { playbackVideoOf } from "../../../shared/domains/video";
import { api } from "../../lib/api";
import { translateUi } from "../../i18n";
import { MediaPreviewLink } from "../media-preview-link";
import { VideoPlayer } from "../video-player";

type ProjectSource = NonNullable<Run["request"]["projectReuse"]>;

function SourceProjectPreview({ source }: { source: ProjectSource }) {
  const [project, setProject] = useState<Run>();
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setProject(undefined);
    setError(false);
    void api<Run>(`/api/runs/${encodeURIComponent(source.projectId)}`, {
      signal: controller.signal,
    }).then(
      (run) => {
        if (!controller.signal.aborted) setProject(run);
      },
      () => {
        if (!controller.signal.aborted) setError(true);
      },
    );
    return () => controller.abort();
  }, [source.projectId]);
  const version = project && projectReuseSource(project, source.jobId);
  if (error || (project && !version))
    return <p role="status">{translateUi("Source preview unavailable")}</p>;
  if (!project || !version) return <p role="status">{translateUi("Loading project…")}</p>;
  const artifact = (file: string) =>
    `/api/artifacts/${encodeURIComponent(project.id)}/${encodeURIComponent(version.job.id)}/${file}`;
  return (
    <>
      <strong>{projectName(project)}</strong>
      <VideoPlayer
        src={artifact(playbackVideoOf(version.job)!)}
        poster={version.job.poster ? artifact(version.job.poster) : undefined}
        aria-label={translateUi("Source project")}
        muted
        autoPlay
        loop
        playsInline
        preload="metadata"
      />
    </>
  );
}

export function ProjectSourceLink({ source }: { source: ProjectSource }) {
  const navigate = useNavigate();
  return (
    <MediaPreviewLink
      onClick={() => navigate(`/projects/${encodeURIComponent(source.projectId)}`)}
      label={translateUi("Source project")}
      content={<SourceProjectPreview source={source} />}
    >
      {translateUi("Source project")}
      {source.version !== undefined &&
        ` · ${translateUi("Version {{value0}}", { value0: source.version })}`}
    </MediaPreviewLink>
  );
}
