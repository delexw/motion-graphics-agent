import { useEffect, useRef, useState } from "react";
import { Button, Tooltip } from "antd";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DeskClip } from "../../lib/production-desk";
import {
  deskBeatTicksVisible,
  deskMusicBeatTimes,
  type DeskMusicBeats,
} from "../../lib/desk-music-beats";
import { translateUi, uiLanguage } from "../../i18n";

const statusLabels = {
  loading: "Loading beat analysis…",
  missing: "No beat analysis",
  stale: "Beat analysis out of date",
  invalid: "Beat analysis invalid",
  unavailable: "Beat analysis unavailable",
  ready: "Measured music beats",
};

export function MusicBeatStrip({ clip, state }: { clip: DeskClip; state?: DeskMusicBeats }) {
  const container = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    // The modal can scale during its opening animation without changing layout width.
    const update = () => setWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const times = deskMusicBeatTimes(clip, state);
  const visible = deskBeatTicksVisible(times, clip.end - clip.start, width);
  const label =
    state?.status === "ready"
      ? !times.length
        ? "No beats in this range"
        : visible
          ? undefined
          : "Beats: zoom in"
      : statusLabels[state?.status ?? "loading"];
  return (
    <span ref={container} className="desk-beat-strip" data-beat-status={state?.status ?? "loading"}>
      {visible &&
        times.map((time, index) => (
          <span
            key={index}
            className="desk-beat-tick"
            aria-hidden="true"
            style={{ left: `${((time - clip.start) / (clip.end - clip.start)) * 100}%` }}
          />
        ))}
      {label && <small className="desk-beat-state">{translateUi(label)}</small>}
    </span>
  );
}

export function MusicBeatInspector({
  clip,
  state,
  navigate,
}: {
  clip: DeskClip;
  state?: DeskMusicBeats;
  navigate: (direction: -1 | 1) => void;
}) {
  const times = deskMusicBeatTimes(clip, state);
  return (
    <section className="desk-beat-inspector" aria-label={translateUi("Music beats")}>
      <h4>{translateUi("Music beats")}</h4>
      <p>{translateUi(statusLabels[state?.status ?? "loading"])}</p>
      {state?.status === "stale" && (
        <p>{translateUi("The audio has changed since this beat map was saved.")}</p>
      )}
      {state?.status === "ready" && (
        <>
          <dl>
            <dt>{translateUi("Tempo")}</dt>
            <dd>
              {state.analysis.bpm === null
                ? translateUi("Tempo uncertain")
                : translateUi("≈{{bpm}} BPM (estimated)", {
                    bpm: uiLanguage.number(state.analysis.bpm),
                  })}
            </dd>
            <dt>{translateUi("Beats in this clip")}</dt>
            <dd>{uiLanguage.number(times.length)}</dd>
          </dl>
          {!times.length && <p>{translateUi("No beats in this range")}</p>}
          <div className="desk-beat-navigation">
            <Tooltip title={translateUi("Previous beat ([)")}>
              <Button
                size="small"
                aria-label={translateUi("Previous beat")}
                icon={<ChevronLeft size={13} />}
                disabled={!times.length}
                onClick={() => navigate(-1)}
              >
                {translateUi("Previous beat")}
              </Button>
            </Tooltip>
            <Tooltip title={translateUi("Next beat (])")}>
              <Button
                size="small"
                aria-label={translateUi("Next beat")}
                icon={<ChevronRight size={13} />}
                disabled={!times.length}
                onClick={() => navigate(1)}
              >
                {translateUi("Next beat")}
              </Button>
            </Tooltip>
          </div>
          <p className="desk-beat-estimate">
            {translateUi("Beat timing is estimated; downbeats and bars are not verified.")}
          </p>
        </>
      )}
    </section>
  );
}
