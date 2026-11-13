import { Button, Switch } from "antd";
import type { LanguageTrackRow } from "../../shared/language-tracks";
import { deliverySpeech } from "../../shared/video-language";
import { translateUi } from "../i18n";
import { SpeechSettings } from "./speech-settings";
export function LanguageTrackRowEditor({
  row,
  label,
  onChange,
  onRemove,
}: {
  row: LanguageTrackRow;
  label: string;
  onChange: (row: LanguageTrackRow) => void;
  onRemove: () => void;
}) {
  const language = row.language;
  const track = row.generateNarration ? { language, speech: row.speech } : undefined;
  return (
    <section
      className="language-track-voice"
      aria-label={`${translateUi(track ? "Narration voice" : "Subtitle language")} ${language}`}
    >
      <div className="language-track-voice-heading">
        <strong>{label}</strong>
        <label className="language-track-toggle">
          <Switch
            aria-label={`${translateUi("Generate narration")} ${language}`}
            checked={row.generateNarration}
            onChange={(generateNarration) => onChange({ ...row, generateNarration })}
          />
          {translateUi("Generate narration")}
        </label>
        <label className="language-track-toggle">
          <Switch
            aria-label={`${translateUi("Show subtitles on screen")} ${language}`}
            checked={row.showSubtitles}
            onChange={(showSubtitles) => onChange({ ...row, showSubtitles })}
          />
          {translateUi("Show subtitles on screen")}
        </label>
        <Button
          className="language-track-remove"
          aria-label={`${translateUi("Remove language")} ${language}`}
          onClick={onRemove}
        >
          {translateUi("Remove language")}
        </Button>
      </div>
      {track && (
        <SpeechSettings
          value={track.speech}
          audioAssets={[]}
          videoLanguage={track.language}
          profileOnly
          timedItem
          sharedScript
          onChange={(speech) => {
            const adapted =
              speech.mode === "narration"
                ? deliverySpeech({
                    outputLanguage: track.language,
                    speech: { ...speech, followVideoLanguage: true },
                  })
                : undefined;
            if (adapted?.mode === "narration")
              onChange({ ...row, speech: { ...adapted, language, followVideoLanguage: false } });
          }}
        />
      )}
    </section>
  );
}
