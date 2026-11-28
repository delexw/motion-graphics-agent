import type { z } from "zod";
import type { FullVideoStoryboardSchema } from "../../src/shared/agents/schemas/storyboard";

export function validStoryboard(durationSeconds = 3) {
  return {
    version: 3 as const,
    title: "An idea unfolds",
    durationSeconds,
    scenes: [
      {
        id: "scene-1",
        title: "Opening",
        startSeconds: 0,
        endSeconds: durationSeconds,
        purpose: "Introduce the idea",
        visuals: [],
        assets: [],
        beats: [
          {
            startSeconds: 0,
            endSeconds: durationSeconds,
            development: "A shape unfolds",
            captions: [],
            audio: { music: "", effects: [], subtitles: [] },
            readingHoldSeconds: 0,
          },
        ],
      },
    ],
    pacingAudit: { findings: [], justifiedHolds: [] },
    notes: [],
  };
}

export function validPlannedStoryboard(
  durationSeconds = 3,
): z.infer<typeof FullVideoStoryboardSchema> {
  const storyboard = validStoryboard(durationSeconds);
  return {
    ...storyboard,
    scenes: storyboard.scenes.map((scene) => ({
      ...scene,
      shots: [
        {
          startSeconds: scene.startSeconds,
          endSeconds: scene.endSeconds,
          framing: "Wide frontal view with the opening mechanism centred and clear of the edge",
          cameraMovement: "Push in slightly as the cover lifts, keeping both hinges in frame",
          visibleAction:
            "The latch releases, the cover lifts, and the inner assembly settles into view",
          transition: "Hold the open cover for the closing frame",
          cues: [],
        },
      ],
    })),
  };
}
