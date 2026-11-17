import { useEffect, useMemo, useState } from "react";
import { MusicAnalysisInspectionSchema } from "../shared/music-analysis";
import { api } from "./lib/api";
import type { DeskMusicBeats } from "./lib/desk-music-beats";

/** One cancellable read per unique source during this Desk session; no audio or inference requests. */
export function useMusicBeats(projectId: string, jobId: string, sources: string[]) {
  const key = JSON.stringify([projectId, jobId, [...new Set(sources)].sort()]);
  const loading = useMemo(
    () => Object.fromEntries(sources.map((source) => [source, { status: "loading" } as const])),
    [key],
  );
  const [saved, setSaved] = useState<{ key: string; values: Record<string, DeskMusicBeats> }>();
  useEffect(() => {
    const controller = new AbortController();
    const values: Record<string, DeskMusicBeats> = { ...loading };
    setSaved({ key, values });
    for (const file of Object.keys(values)) {
      const url = `/api/music-analysis/${encodeURIComponent(projectId)}/${encodeURIComponent(jobId)}?file=${encodeURIComponent(file)}`;
      void api<unknown>(url, { signal: controller.signal })
        .then((value) => MusicAnalysisInspectionSchema.parse(value))
        .catch(() => ({ status: "unavailable" }) as const)
        .then((state) => {
          if (controller.signal.aborted) return;
          setSaved((previous) =>
            previous?.key === key
              ? { key, values: { ...previous.values, [file]: state } }
              : previous,
          );
        });
    }
    return () => controller.abort();
  }, [key, loading, projectId, jobId]);
  return saved?.key === key ? saved.values : loading;
}
