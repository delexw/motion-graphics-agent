import { FileVideo, AudioLines, FileText, Captions } from "lucide-react";
import { useState } from "react";
import { ConfigProvider, Flex, Select } from "antd";
import { DownloadIconButton } from "./download-icon-button";
import type { LanguageMedia } from "../../shared/language-tracks";
import { videoLanguageLabel } from "../../shared/video-language";
import { translateUi, useUiLanguage } from "../i18n";
export function LanguageMediaDownloads({
  media,
  downloadName,
}: {
  media: LanguageMedia;
  downloadName: string;
}) {
  useUiLanguage();
  const [language, setLanguage] = useState(media.defaultNarration || media.narration[0]?.language);
  const [subtitle, setSubtitle] = useState(media.subtitles[0]?.language);
  const [audio, setAudio] = useState("mix");
  const selected =
    media.narration.find((track) => track.language === language) || media.narration[0];
  const captions =
    media.subtitles.find((track) => track.language === subtitle) || media.subtitles[0];
  return (
    <ConfigProvider getPopupContainer={(trigger) => trigger?.parentElement ?? document.body}>
      <section
        className="language-media-downloads"
        style={{ maxWidth: "100%" }}
        aria-label={translateUi("Language downloads")}
      >
        <h4>{translateUi("Language downloads")}</h4>
        <Flex gap="middle" wrap align="center">
          {selected ? (
            <Flex gap="middle" wrap align="center">
              <Flex gap="small" wrap align="center">
                <Select
                  aria-label={translateUi("Download narration language")}
                  value={selected.language}
                  options={media.narration.map((track) => ({
                    value: track.language,
                    label: videoLanguageLabel(track.language),
                  }))}
                  onChange={setLanguage}
                />
                <DownloadIconButton
                  label={translateUi("Download MP4")}
                  icon={<FileVideo size={18} aria-hidden="true" />}
                  href={selected.video}
                  download={`${downloadName}-${selected.language}.mp4`}
                />
              </Flex>
              <Flex gap="small" wrap align="center">
                <Select
                  aria-label={translateUi("Download audio type")}
                  value={audio}
                  options={[
                    { value: "mix", label: translateUi("Voice and music") },
                    { value: "voice", label: translateUi("Narration only") },
                  ]}
                  onChange={setAudio}
                />
                <DownloadIconButton
                  label={translateUi("Download audio")}
                  icon={<AudioLines size={18} aria-hidden="true" />}
                  href={audio === "mix" ? selected.mix : selected.audio}
                  download={`${downloadName}-${selected.language}-${audio}.${audio === "mix" ? "m4a" : "wav"}`}
                />
              </Flex>
            </Flex>
          ) : (
            <DownloadIconButton
              href={media.musicVideo}
              download={`${downloadName}.mp4`}
              label={translateUi("Download MP4")}
              icon={<FileVideo size={18} aria-hidden="true" />}
            />
          )}
          {captions && (
            <Flex gap="small" wrap align="center">
              <Select
                aria-label={translateUi("Download subtitle language")}
                value={captions.language}
                options={media.subtitles.map((track) => ({
                  value: track.language,
                  label: videoLanguageLabel(track.language),
                }))}
                onChange={setSubtitle}
              />
              <DownloadIconButton
                label="SRT"
                icon={<FileText size={18} aria-hidden="true" />}
                href={captions.srt}
                download={`${downloadName}-${captions.language}.srt`}
              />
              <DownloadIconButton
                label="VTT"
                icon={<Captions size={18} aria-hidden="true" />}
                href={captions.vtt}
                download={`${downloadName}-${captions.language}.vtt`}
              />
            </Flex>
          )}
        </Flex>
      </section>
    </ConfigProvider>
  );
}
