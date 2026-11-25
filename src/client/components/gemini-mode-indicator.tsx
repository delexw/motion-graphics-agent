import { Tag } from "antd";
import { FlaskConical } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { agentModelChoices } from "../../shared/agent-providers";
import { translateUi, useUiLanguage } from "../i18n";
import { api } from "../lib/api";
import { SettingsHelpTip } from "./settings-help-tip";
import "./gemini-mode-indicator.css";

export type GeminiTransportSetup = {
  geminiTransport?: "sdk" | "cli" | null;
  geminiCredentialPresent?: boolean;
};

export function geminiModeTooltip(setup?: GeminiTransportSetup): string {
  if (setup?.geminiTransport === "sdk") {
    return setup.geminiCredentialPresent === false
      ? translateUi(
          "Gemini mode is in beta. Configured for Gemini API, but no API credentials were detected.",
        )
      : translateUi("Gemini mode is in beta. Currently using Gemini API.");
  }
  if (setup?.geminiTransport === "cli") {
    return setup.geminiCredentialPresent === false
      ? translateUi(
          "Gemini mode is in beta. Configured for agy CLI, but agy was not found on PATH.",
        )
      : translateUi("Gemini mode is in beta. Currently using agy CLI.");
  }
  if (setup?.geminiTransport === null) {
    return translateUi("Gemini mode is in beta. VIDEO_GEMINI_TRANSPORT has an invalid value.");
  }
  return translateUi(
    "Gemini mode is in beta. Uses Gemini API when configured, or agy CLI otherwise.",
  );
}

export function GeminiBetaTag() {
  useUiLanguage();
  const label = translateUi("Beta");
  return (
    <Tag color="gold" className="gemini-beta-tag" aria-label={label} title={label}>
      <FlaskConical size={12} aria-hidden="true" />
    </Tag>
  );
}

export function GeminiModeBadge({ setup }: { setup?: GeminiTransportSetup }) {
  useUiLanguage();
  const [fetchedSetup, setFetchedSetup] = useState<GeminiTransportSetup>();
  const shouldFetch = setup?.geminiTransport === undefined;

  useEffect(() => {
    if (!shouldFetch) return;
    const controller = new AbortController();
    void api<GeminiTransportSetup>("/api/setup", { signal: controller.signal })
      .then((next) => setFetchedSetup(next))
      .catch(() => {});
    return () => controller.abort();
  }, [shouldFetch]);

  const resolvedSetup = shouldFetch ? fetchedSetup : setup;
  return (
    <span className="gemini-mode-badge">
      <GeminiBetaTag />
      <SettingsHelpTip
        label={translateUi("About Gemini mode")}
        title={geminiModeTooltip(resolvedSetup)}
      />
    </span>
  );
}

export function renderAgentModelOption(option: {
  value?: string | number | null;
  label?: ReactNode;
}) {
  const choice = agentModelChoices.find((entry) => entry.value === String(option.value ?? ""));
  if (choice?.provider !== "gemini") return option.label;
  return (
    <span className="gemini-model-option">
      <span>{option.label}</span>
      <GeminiBetaTag />
    </span>
  );
}
