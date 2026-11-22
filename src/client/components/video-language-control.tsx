import { SettingsHelpTip } from "./settings-help-tip";
import { translateUi, useUiLanguage } from "../i18n";
import { Select } from "antd";
import { videoLanguages, type VideoLanguage } from "../../shared/video-language";

export function VideoLanguageControl({
  value,
  onChange,
}: {
  value?: VideoLanguage;
  onChange: (language: VideoLanguage) => void;
}) {
  useUiLanguage();
  return (
    <div className="settings-field">
      <span className="settings-field-label">
        {translateUi("Video language")}
        <SettingsHelpTip
          label={translateUi("About video language")}
          title={translateUi(
            "Controls titles, labels, diagrams and credits built into the video. Narration and subtitle tracks have their own language settings.",
          )}
        />
      </span>
      <Select
        aria-label={translateUi("Video language")}
        value={value}
        placeholder={translateUi("Use idea language")}
        options={videoLanguages.map((entry) => ({ ...entry, label: translateUi(entry.label) }))}
        onChange={onChange}
      />
    </div>
  );
}
