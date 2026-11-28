import {
  parseStyleGuide,
  formatVideoBuildGuide,
  type CombinedStyleGuide,
} from "../../../../shared/agents/schemas/combined-style-guide";
import type { Style, StyleCandidate, VideoRequest } from "../../../../shared/contracts";
import type { VideoGenerationJob } from "../../../../shared/domains/video";
import { hasOnScreenSubtitles } from "../../../../shared/script-items";
import { videoRendererOf, videoRenderers } from "../../../../shared/video-renderers";

const defaultGuide: CombinedStyleGuide = {
  "Visual identity": "Use the selected direction's visual identity and assigned scene roles.",
  "Surfaces and construction": "Use the selected styles' material rules for each assigned layer.",
  "Colour roles": "Preserve approved colours and check contrast against each local surface.",
  "Lettering and captions": "Preserve approved wording, reading time and safe areas.",
  "Timing and movement": "Use the approved beats and leave time to read the result.",
  "Framing and viewpoint": "Frame the subject and its action so their relationship is visible.",
  "Sound options": "Place enabled sound around the visible action and preserve the speech windows.",
  "Characteristic actions":
    "Show the selected techniques through the actions assigned in the plan.",
  "Review checks": "Check style fidelity, readable text and deterministic seeking.",
  "Implementation tools":
    "Use the available visual and motion tools in the supporting renderer contract.",
  "Project choices": "Use the original idea, approved assets and plan to choose the scene details.",
};

/** Resolve the guide after planning, using the same values that the render workflow uses. */
export function videoBuildGuide(input: {
  request: VideoRequest;
  job: VideoGenerationJob;
  candidate: StyleCandidate;
  styles: readonly Style[];
  width: number;
  height: number;
  fps: number;
}) {
  const { request, job, candidate, styles, width, height, fps } = input;
  const preview = job.kind === "preview";
  const plannedGuide = preview
    ? candidate.combinedStyleGuide
    : job.buildPlan?.value.combinedStyleGuide;
  const selectedGuides = [candidate.primaryStyleId, ...candidate.supportingStyleIds].flatMap(
    (id) => {
      const style = styles.find((entry) => entry.id === id);
      const guide = style && parseStyleGuide(style.executable_prompt_template);
      return style && guide ? [{ id, name: style.name_en, ...guide }] : [];
    },
  );
  const primaryGuide = selectedGuides.find((guide) => guide.id === candidate.primaryStyleId);
  const guide = plannedGuide ?? primaryGuide?.sections ?? defaultGuide;
  const summary =
    selectedGuides.length < 2
      ? selectedGuides[0]?.summary
      : selectedGuides.map((selected) => `${selected.name}. ${selected.summary}`).join(" ");
  const renderer = videoRendererOf(request);
  const tracks = request.languageTracks;
  const items = request.scriptItems;
  const music = request.requirements?.music;
  const subtitlesEnabled = hasOnScreenSubtitles(request);
  const settings = {
    "Visual identity": {
      primaryStyleId: candidate.primaryStyleId,
      supportingStyleIds: candidate.supportingStyleIds,
      sceneRoles: candidate.sceneRoles,
    },
    "Lettering and captions": {
      videoLanguage: request.outputLanguage ?? "idea language",
      subtitlesEnabled,
      subtitleSettings: request.subtitles,
      subtitleLanguages: tracks?.subtitles,
      defaultSubtitleLanguage: tracks?.defaultSubtitle,
      timedCaptions: subtitlesEnabled
        ? items
            ?.filter((item) => item.showSubtitles)
            .map(({ id, source, text }) => ({ id, source, text }))
        : undefined,
    },
    "Timing and movement": {
      durationSeconds: job.duration,
      requestedFilmDuration: preview ? undefined : request.duration,
      timedScriptWindows: preview
        ? undefined
        : items?.map(({ id, startSeconds, endSeconds }) => ({ id, startSeconds, endSeconds })),
    },
    "Sound options": preview
      ? { audio: "silent", narration: "off", music: "off", effects: "off" }
      : {
          narration:
            items === undefined ? (request.speech ?? { mode: "off" }) : "per timed script item",
          timedNarration: items?.map(({ id, source, text, speech }) => ({
            id,
            source,
            text,
            speech,
          })),
          narrationLanguages: tracks?.narration,
          defaultNarrationLanguage: tracks?.defaultNarration,
          musicStyle: music?.style,
          musicInstructions: music?.instructions,
          musicAssetIds: music?.assetIds,
        },
    "Implementation tools": { renderer, compositionPipeline: videoRenderers[renderer].pipeline },
    "Project choices": {
      aspectRatio: request.aspectRatio,
      resolution: preview ? "720p" : (request.resolution ?? "1080p"),
      width,
      height,
      fps,
    },
  } satisfies Partial<Record<keyof CombinedStyleGuide, object>>;
  const sections = { ...guide };
  for (const name of Object.keys(settings) as (keyof typeof settings)[]) {
    const direction =
      preview && name === "Sound options"
        ? "Keep the preview silent. Use visible movement and reading holds to convey the rhythm."
        : guide[name];
    sections[name] =
      `Effective settings for this build: ${JSON.stringify(settings[name])}\n\n${direction}`;
  }
  return formatVideoBuildGuide(sections, summary);
}
