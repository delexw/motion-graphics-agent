import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ConfigProvider, Select, Typography } from "antd";
import { translateUi, useUiLanguage } from "../i18n";
import { videoLanguages, type VideoLanguage } from "../../shared/video-language";
import {
  selectLanguageTrackLanguages,
  languageTrackRows,
  individualLanguageTracks,
  addLanguageTrack,
} from "../../shared/language-tracks";
import type { VideoRequest } from "../../shared/domains/video";
import type { LanguageTracks } from "../../shared/language-tracks";
import { LanguageTrackRowEditor } from "./language-track-row";
import "./language-track-settings.css";

export function LanguageTrackSettings({
  request,
  onChange,
}: {
  request: Pick<VideoRequest, "languageTracks" | "speech" | "scriptItems" | "outputLanguage">;
  onChange: (value: LanguageTracks | undefined) => void;
}) {
  useUiLanguage();
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ languageTracksSupported?: boolean }>("/api/setup", { signal: controller.signal })
      .then((setup) => setSupported(setup.languageTracksSupported === true))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const value = request.languageTracks;
  const options = videoLanguages.map((entry) => ({
    value: entry.value,
    label: translateUi(entry.label),
  }));
  useEffect(() => {
    if (!value) {
      if (supported)
        onChange(
          selectLanguageTrackLanguages(
            request,
            request.speech?.mode === "narration" ||
              request.scriptItems?.some((item) => item.speech.mode === "narration")
              ? [request.outputLanguage || "en"]
              : [],
          ),
        );
      return;
    }
  }, [request, value, onChange, supported]);
  const rows = languageTrackRows(request);
  const languages = rows.map((row) => row.language);
  return (
    <section aria-label={translateUi("Language tracks")} className="language-track-settings">
      {!supported && (
        <Typography.Text type="secondary">
          {translateUi(
            "Language tracks require the updated backend. Existing builds keep running until it can be restarted.",
          )}
        </Typography.Text>
      )}
      <ConfigProvider componentDisabled={!supported}>
        {value && (
          <>
            <Typography.Text type="secondary">
              {translateUi("Use supplied text for subtitles, with optional narration.")}
            </Typography.Text>
            {rows.map((row) => (
              <LanguageTrackRowEditor
                key={row.language}
                row={row}
                label={
                  options.find((option) => option.value === row.language)?.label ?? row.language
                }
                onChange={(next) =>
                  onChange(
                    individualLanguageTracks(
                      request,
                      rows.map((item) => (item.language === row.language ? next : item)),
                    ),
                  )
                }
                onRemove={() =>
                  onChange(
                    individualLanguageTracks(
                      request,
                      rows.filter((item) => item.language !== row.language),
                    ),
                  )
                }
              />
            ))}
            {languages.length < options.length && (
              <label className="language-track-add">
                {translateUi("Add language")}
                <Select<VideoLanguage>
                  aria-label={translateUi("Add language")}
                  placeholder={translateUi("Choose languages")}
                  value={undefined}
                  options={options.filter((option) => !languages.includes(option.value))}
                  onChange={(language) => onChange(addLanguageTrack(request, language))}
                />
              </label>
            )}
          </>
        )}
      </ConfigProvider>
    </section>
  );
}
