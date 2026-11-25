import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  GeminiModeBadge,
  geminiModeTooltip,
  renderAgentModelOption,
} from "../../src/client/components/gemini-mode-indicator";
import { uiLanguage } from "../../src/client/i18n";
import { RoomOnboarding } from "../../src/client/room/room-onboarding";
import { emptyRoomDraft } from "../../src/client/room/onboarding";

afterEach(async () => {
  await uiLanguage.change("en");
});

describe("Gemini mode Beta and transport indicator", () => {
  it("explains API vs agy CLI transport states accurately in the tooltip", () => {
    expect(geminiModeTooltip({ geminiTransport: "sdk", geminiCredentialPresent: true })).toContain(
      "Currently using Gemini API",
    );
    expect(geminiModeTooltip({ geminiTransport: "sdk", geminiCredentialPresent: false })).toContain(
      "no API credentials were detected",
    );
    expect(geminiModeTooltip({ geminiTransport: "cli", geminiCredentialPresent: true })).toContain(
      "Currently using agy CLI",
    );
    expect(geminiModeTooltip({ geminiTransport: "cli", geminiCredentialPresent: false })).toContain(
      "agy was not found on PATH",
    );
    expect(geminiModeTooltip({ geminiTransport: null, geminiCredentialPresent: false })).toContain(
      "VIDEO_GEMINI_TRANSPORT has an invalid value",
    );
    expect(geminiModeTooltip()).toContain("Uses Gemini API when configured, or agy CLI otherwise");
  });

  it("renders icon-only Beta tag and accessible help tip button for Gemini mode", async () => {
    const html = renderToStaticMarkup(
      <GeminiModeBadge setup={{ geminiTransport: "cli", geminiCredentialPresent: true }} />,
    );
    expect(html).toContain("gemini-beta-tag");
    expect(html).toContain('aria-label="Beta"');
    expect(html).toContain("<svg");
    expect(html).not.toContain(">Beta<");
    expect(html).toContain('aria-label="About Gemini mode"');

    const fallbackHtml = renderToStaticMarkup(<GeminiModeBadge />);
    expect(fallbackHtml).toContain("gemini-beta-tag");
    expect(fallbackHtml).toContain('aria-label="Beta"');
    expect(fallbackHtml).not.toContain(">Beta<");
    expect(fallbackHtml).toContain('aria-label="About Gemini mode"');

    await uiLanguage.change("zh-CN");
    const zhHtml = renderToStaticMarkup(
      <GeminiModeBadge setup={{ geminiTransport: "sdk", geminiCredentialPresent: true }} />,
    );
    expect(zhHtml).toContain('aria-label="测试版"');
    expect(zhHtml).not.toContain(">测试版<");
    expect(zhHtml).toContain('aria-label="关于 Gemini 模式"');
  });

  it("marks only Gemini model options with the icon-only Beta tag", () => {
    const neonOption = renderToStaticMarkup(
      <>{renderAgentModelOption({ value: "gemini", label: "Gemini 4 Neon" })}</>,
    );
    expect(neonOption).toContain("Gemini 4 Neon");
    expect(neonOption).toContain("gemini-beta-tag");
    expect(neonOption).toContain('aria-label="Beta"');
    expect(neonOption).not.toContain(">Beta<");

    const carbonOption = renderToStaticMarkup(
      <>{renderAgentModelOption({ value: "gemini-4-carbon", label: "Gemini 4 Carbon" })}</>,
    );
    expect(carbonOption).toContain("Gemini 4 Carbon");
    expect(carbonOption).toContain("gemini-beta-tag");
    expect(carbonOption).not.toContain(">Beta<");

    const codexOption = renderToStaticMarkup(
      <>{renderAgentModelOption({ value: "codex", label: "GPT-6.2 Astra" })}</>,
    );
    expect(codexOption).toBe("GPT-6.2 Astra");

    const claudeOption = renderToStaticMarkup(
      <>{renderAgentModelOption({ value: "claude", label: "Claude Opus 5.5" })}</>,
    );
    expect(claudeOption).toBe("Claude Opus 5.5");
  });

  it("shows the Gemini Beta badge and tip in RoomOnboarding step 7 only when Gemini is selected", () => {
    const renderStep7 = (provider: "gemini" | "codex", mainModel?: string) =>
      renderToStaticMarkup(
        <RoomOnboarding
          draft={{
            ...emptyRoomDraft(),
            step: 7,
            request: {
              instructions: "A short film about a lighthouse",
              provider,
              ...(mainModel ? { mainModel } : {}),
            },
          }}
          onChange={() => {}}
          materials={[]}
          styles={[]}
          examples={[]}
          onCreated={() => {}}
          onUpload={async () => []}
        />,
      );

    const geminiHtml = renderStep7("gemini", "gemini-4-carbon");
    expect(geminiHtml).toContain("gemini-beta-tag");
    expect(geminiHtml).toContain('aria-label="Beta"');
    expect(geminiHtml).not.toContain(">Beta<");
    expect(geminiHtml).toContain('aria-label="About Gemini mode"');

    const codexHtml = renderStep7("codex");
    expect(codexHtml).not.toContain('aria-label="About Gemini mode"');
    expect(codexHtml).not.toContain("gemini-beta-tag");
  });
});
