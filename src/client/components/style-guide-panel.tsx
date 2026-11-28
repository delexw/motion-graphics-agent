import { Collapse } from "antd";
import {
  parseStyleGuide,
  styleGuideSectionNames,
} from "../../shared/agents/schemas/combined-style-guide";
import { translateUi } from "../i18n";
import { PromptText } from "./style-mention";

export function StyleGuidePanel({ markdown }: { markdown: string }) {
  const guide = parseStyleGuide(markdown);
  if (!guide) return null;

  return (
    <Collapse
      destroyOnHidden
      size="small"
      items={[
        {
          key: "guide",
          label: translateUi("Style guide"),
          children: (
            <>
              <p>
                <PromptText>{guide.summary}</PromptText>
              </p>
              {styleGuideSectionNames.map((name) => (
                <section key={name}>
                  <h4>{translateUi(name)}</h4>
                  <p>
                    <PromptText>{guide.sections[name]}</PromptText>
                  </p>
                </section>
              ))}
            </>
          ),
        },
      ]}
    />
  );
}
