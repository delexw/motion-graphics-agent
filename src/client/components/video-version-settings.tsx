import { Descriptions } from "antd";
import type { VideoGenerationJob, VideoRequest } from "../../shared/domains/video";
import { languageTrackRows } from "../../shared/language-tracks";
import { speechEngines, speechVoices } from "../../shared/speech";
import { translateUi } from "../i18n";

/** Display the selected version's effective settings, never another version's original profile. */
export function VideoVersionSettings({
  job,
  request,
}: {
  job: VideoGenerationJob;
  request: VideoRequest;
}) {
  const effective = job.effectiveRequest ?? request;
  const rows = languageTrackRows(effective);
  const profiles = rows
    .filter((row) => row.generateNarration)
    .map((row) => ({ language: row.language, speech: row.speech }));
  if (!profiles.length && !effective.languageTracks && effective.speech?.mode === "narration")
    profiles.push({ language: effective.outputLanguage ?? "en", speech: effective.speech });
  return (
    <details className="video-version-settings">
      <summary>{translateUi("Version settings")}</summary>
      <Descriptions
        size="small"
        column={1}
        items={[
          {
            key: "output",
            label: translateUi("Output"),
            children: `${effective.aspectRatio} · ${effective.resolution ?? "1080p"} · ${effective.frameRate ?? 30} fps`,
          },
          {
            key: "voice",
            label: translateUi("Narration"),
            children: profiles.length
              ? profiles
                  .map(
                    ({ language, speech }) =>
                      `${language} · ${speechEngines.find((engine) => engine.id === (speech.engine ?? "kokoro"))?.label ?? speech.engine} · ${speechVoices.find((voice) => voice.id === speech.voice)?.label ?? speech.voice} · ${speech.speed}× · ${Math.round((speech.volume ?? 1) * 100)}%`,
                  )
                  .join("; ")
              : translateUi("Off"),
          },
          {
            key: "subtitles",
            label: translateUi("Subtitles"),
            children: effective.languageTracks
              ? effective.languageTracks.subtitles.join(", ") || translateUi("Off")
              : effective.subtitles && effective.subtitles.mode !== "off"
                ? (effective.outputLanguage ?? "en")
                : translateUi("Off"),
          },
        ]}
      />
    </details>
  );
}
