import { expect } from "@playwright/test";
import { videoLanguages } from "../../src/shared/video-language";
import { mingVoices } from "../../src/shared/speech";
import { test } from "../fixtures/playwright-app";

for (const fixture of [
  { engine: "kokoro", voice: "af_heart", languages: ["zh", "ja"], subtitleOnly: true },
  {
    engine: "ming-tts",
    voice: "ming_original_female",
    languages: ["zh", "en"],
    subtitleOnly: false,
  },
  {
    engine: "ming-tts",
    voice: mingVoices[0].id,
    languages: ["en", "zh", "ja", "ko", "de", "fr", "es"],
    subtitleOnly: false,
  },
]) {
  test.describe(`${fixture.engine}, ${fixture.voice}, ${fixture.languages.length} tracks`, () => {
    test.use({
      fixtureHtml: `<style>body{margin:0;padding:16px;box-sizing:border-box}#root{max-width:1100px}</style><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{LanguageTrackSettings}from'/src/client/components/language-track-settings.tsx';import{VideoRequestSchema}from'/src/shared/domains/video.ts';import'/src/client/framework.css';
const fixture=${JSON.stringify(fixture)};const request=VideoRequestSchema.parse({instructions:'Explain an example',outputLanguage:'ja',speech:{mode:'off'},subtitles:{mode:'provided',text:'光を連れて'},languageTracks:{narration:fixture.subtitleOnly?[]:fixture.languages.map(language=>({language,speech:{mode:'narration',engine:fixture.engine,voice:fixture.voice,language,speed:1,volume:1}})),subtitles:fixture.languages,defaultNarration:fixture.subtitleOnly?undefined:fixture.languages[0],defaultSubtitle:fixture.languages[0]}});
function Fixture(){const[state,setState]=React.useState(request);return React.createElement(React.Fragment,null,React.createElement(LanguageTrackSettings,{request:state,onChange:languageTracks=>setState(previous=>({...previous,languageTracks}))}),React.createElement('pre',{id:'state'},JSON.stringify(state)));}createRoot(document.getElementById('root')).render(React.createElement(Fixture));</script>`,
    });

    test("aligns language voice controls and handles narrow settings panels", async ({
      page,
      fixtureUrl,
    }) => {
      await page.route(
        (url) => url.origin === new URL(fixtureUrl).origin && url.pathname.startsWith("/api/"),
        (route) => route.fulfill({ json: { languageTracksSupported: true, available: true } }),
      );
      await page.goto(fixtureUrl);
      const narrationSwitch = (language: string) =>
        page.getByRole("switch", { name: `Generate narration ${language}`, exact: true });
      const subtitleSwitch = (language: string) =>
        page.getByRole("switch", { name: `Show subtitles on screen ${language}`, exact: true });
      const speechSettings = page.locator(".speech-settings");
      const requestState = () =>
        page.locator("#state").evaluate((node) => JSON.parse(node.textContent ?? "{}"));
      await expect(narrationSwitch(fixture.languages[0])).toBeVisible();
      if (fixture.subtitleOnly) {
        await expect(page.locator(".language-track-voice")).toHaveCount(fixture.languages.length);
        await expect(speechSettings).toHaveCount(0);
        const initial = await requestState();
        expect(initial.languageTracks.narration).toEqual([]);
        expect(initial.languageTracks.subtitles).toEqual(["zh", "ja"]);
        for (const language of fixture.languages) await narrationSwitch(language).click();
      }
      await expect(speechSettings).toHaveCount(fixture.languages.length);
      await expect(page.locator(".speech-ready")).toHaveCount(fixture.languages.length);
      if (fixture.engine === "ming-tts") {
        const voiceSelect = page.locator(".speech-voice-control").first().getByRole("combobox");
        const voiceOptions = page.locator(
          ".ant-select-dropdown:visible .ant-select-item-option-content",
        );
        await voiceSelect.click();
        await expect(voiceOptions.first()).toBeVisible();
        const visible = new Set<string>();
        for (let index = 0; index <= mingVoices.length; index++) {
          const names = await voiceOptions.allTextContents();
          for (const name of names) visible.add(name);
          if (index === mingVoices.length) break;
          const active = await voiceSelect.getAttribute("aria-activedescendant");
          await voiceSelect.press("ArrowDown");
          await expect(voiceSelect).not.toHaveAttribute("aria-activedescendant", active ?? "");
        }
        for (const voice of mingVoices.filter(
          (voice) => voice.gender === "female" && voice.language === "zh",
        ))
          expect(visible.has(voice.label)).toBe(true);
        await page.keyboard.press("Escape");
      }

      await expect(page.locator(".language-track-settings > label .ant-switch")).toHaveCount(0);
      const headers = await page.locator(".language-track-voice-heading").evaluateAll((nodes) =>
        nodes.map((node) => ({
          switches: node.querySelectorAll('[role="switch"]').length,
          first: node.firstElementChild?.tagName,
        })),
      );
      expect(headers.every((header) => header.switches === 2 && header.first === "STRONG")).toBe(
        true,
      );
      const subtitleSpacing = await page
        .locator(".language-track-toggle")
        .first()
        .evaluate((el) => ({
          display: getComputedStyle(el).display,
          gap: parseFloat(getComputedStyle(el).gap),
          alignItems: getComputedStyle(el).alignItems,
        }));
      expect(subtitleSpacing).toEqual({ display: "flex", gap: 8, alignItems: "center" });
      for (const width of [1200, 420]) {
        await page.setViewportSize({ width, height: 900 });
        const layouts = await speechSettings.evaluateAll((sections) =>
          sections.map((section) => {
            const rect = (selector: string) =>
              section.querySelector(selector)!.getBoundingClientRect();
            const engine = section
                .querySelector('[aria-label="Speech engine"]')!
                .closest(".ant-select")!
                .getBoundingClientRect(),
              voice = rect(".speech-voice-control"),
              select = rect(".speech-voice-control .ant-select"),
              button = rect(".speech-voice-control button");
            const adjustments = section.querySelectorAll(".speech-adjustment");
            const volume = adjustments[0].getBoundingClientRect(),
              speed = adjustments[1].getBoundingClientRect();
            return {
              engineTop: engine.top,
              voiceTop: voice.top,
              volumeTop: volume.top,
              speedTop: speed.top,
              selectHeight: select.height,
              buttonHeight: button.height,
              right: section.getBoundingClientRect().right,
              headings: section.querySelectorAll(".settings-section-heading").length,
            };
          }),
        );
        expect(layouts).toHaveLength(fixture.languages.length);
        for (const l of layouts) {
          expect(l.selectHeight).toBeCloseTo(l.buttonHeight, 0);
          expect(l.right).toBeLessThanOrEqual(width);
          expect(l.headings).toBe(0);
          if (width > 520) {
            expect(l.engineTop).toBeCloseTo(l.voiceTop, 0);
            expect(l.volumeTop).toBeCloseTo(l.speedTop, 0);
          } else {
            expect(l.voiceTop).toBeGreaterThan(l.engineTop);
            expect(l.speedTop).toBeGreaterThan(l.volumeTop);
          }
        }
      }
      const first = fixture.languages[0];
      await narrationSwitch(first).click();
      await expect(speechSettings).toHaveCount(fixture.languages.length - 1);
      const independent = await requestState();
      expect(
        independent.languageTracks.narration.map((track: { language: string }) => track.language),
      ).toEqual(fixture.languages.slice(1));
      await narrationSwitch(first).click();
      await expect(speechSettings).toHaveCount(fixture.languages.length);
      for (const language of fixture.languages) await narrationSwitch(language).click();
      await expect(speechSettings).toHaveCount(0);
      const silent = await requestState();
      expect(silent.languageTracks.narration).toEqual([]);
      expect(silent.languageTracks.subtitles).toEqual(fixture.languages);
      expect(silent.subtitles).toEqual({ mode: "provided", text: "光を連れて" });
      await subtitleSwitch(fixture.languages[0]).click();
      const captions = await requestState();
      expect(captions.languageTracks.subtitles).toEqual(fixture.languages.slice(1));
      await subtitleSwitch(fixture.languages[0]).click();
      const restored = await requestState();
      expect(restored.languageTracks.narration).toEqual([]);
      expect(restored.languageTracks.subtitles).toEqual(fixture.languages);
      expect(restored.languageTracks.showSubtitles).toBe(true);
      const added = videoLanguages.find((entry) => !fixture.languages.includes(entry.value));
      if (added) {
        const addLanguage = page.locator(".language-track-add").getByRole("combobox");
        await addLanguage.click();
        await expect(
          page.locator(".ant-select-dropdown:visible .ant-select-item-option").first(),
        ).toBeVisible();
        await addLanguage.press("Enter");
        await expect(narrationSwitch(added.value)).toHaveAttribute("aria-checked", "false");
        await expect(subtitleSwitch(added.value)).toHaveAttribute("aria-checked", "false");
        await expect(speechSettings).toHaveCount(0);
      }
    });
  });
}
