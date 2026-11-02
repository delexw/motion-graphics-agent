import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button, ConfigProvider, Select, Switch, Typography } from "antd";
import { translateUi, useUiLanguage } from "../i18n";
import { videoLanguages, deliverySpeech, type VideoLanguage } from "../../shared/video-language";
import { selectLanguageTrackLanguages } from "../../shared/language-tracks";
import type { VideoRequest } from "../../shared/domains/video";
import type { LanguageTracks } from "../../shared/language-tracks";
import { SpeechSettings } from "./speech-settings";
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
  const languages = value
    ? [...new Set([...value.narration.map((track) => track.language), ...value.subtitles])]
    : [];
  const narrationEnabled = Boolean(value?.narration.length);
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
            <label className="language-track-subtitles">
              <Switch
                aria-label={translateUi("Generate narration")}
                checked={narrationEnabled}
                onChange={(enabled) =>
                  onChange(
                    selectLanguageTrackLanguages(
                      request,
                      languages.length ? languages : [request.outputLanguage || "en"],
                      { narrationEnabled: enabled },
                    ),
                  )
                }
              />
              {translateUi("Generate narration")}
            </label>
            <label className="language-track-subtitles">
              <Switch
                aria-label={translateUi("Show subtitles on screen")}
                checked={value.showSubtitles !== false}
                onChange={(showSubtitles) =>
                  onChange(
                    selectLanguageTrackLanguages(
                      { ...request, languageTracks: { ...value, showSubtitles } },
                      languages,
                    ),
                  )
                }
              />
              {translateUi("Show subtitles on screen")}
            </label>
            {languages.map((language) => {
              const track = value.narration.find((item) => item.language === language);
              return (
                <section
                  key={language}
                  className="language-track-voice"
                  aria-label={`${translateUi(track ? "Narration voice" : "Subtitle language")} ${language}`}
                >
                  <div className="language-track-voice-heading">
                    <strong>{options.find((option) => option.value === language)?.label}</strong>
                    <Button
                      aria-label={`${translateUi("Remove language")} ${language}`}
                      onClick={() =>
                        onChange(
                          selectLanguageTrackLanguages(
                            request,
                            languages.filter((item) => item !== language),
                          ),
                        )
                      }
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
                          onChange({
                            ...value,
                            narration: value.narration.map((item) =>
                              item.language === track.language
                                ? {
                                    ...track,
                                    speech: {
                                      ...adapted,
                                      language: track.language,
                                      followVideoLanguage: false,
                                    },
                                  }
                                : item,
                            ),
                          });
                      }}
                    />
                  )}
                </section>
              );
            })}
            {languages.length < options.length && (
              <label className="language-track-add">
                {translateUi("Add language")}
                <Select<VideoLanguage>
                  aria-label={translateUi("Add language")}
                  placeholder={translateUi("Choose languages")}
                  value={undefined}
                  options={options.filter((option) => !languages.includes(option.value))}
                  onChange={(language) =>
                    onChange(selectLanguageTrackLanguages(request, [...languages, language]))
                  }
                />
              </label>
            )}
          </>
        )}
      </ConfigProvider>
    </section>
  );
}
