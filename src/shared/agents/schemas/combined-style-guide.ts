import { z } from "zod";

const section = z.string().trim().min(1);

export const CombinedStyleGuideSchema = z.strictObject({
  "Visual identity": section,
  "Surfaces and construction": section,
  "Colour roles": section,
  "Lettering and captions": section,
  "Timing and movement": section,
  "Framing and viewpoint": section,
  "Sound options": section,
  "Characteristic actions": section,
  "Review checks": section,
  "Implementation tools": section,
  "Project choices": section,
});

export type CombinedStyleGuide = z.infer<typeof CombinedStyleGuideSchema>;

export const styleGuideSectionNames = CombinedStyleGuideSchema.keyof().options;

export function parseStyleGuide(markdown: string) {
  const [overview, ...sections] = markdown.trim().split(/\n\n(?=## )/);
  const summary = overview.match(/^> ([^\n]+)$/)?.[1]?.trim();
  if (!summary) return undefined;
  if (sections.length !== styleGuideSectionNames.length) return undefined;
  const entries = styleGuideSectionNames.map((name, index) => {
    const heading = `## ${name}\n`;
    const section = sections[index];
    return [name, section.startsWith(heading) ? section.slice(heading.length) : undefined];
  });
  const result = CombinedStyleGuideSchema.safeParse(Object.fromEntries(entries));
  return result.success ? { summary, sections: result.data } : undefined;
}

export function formatStyleGuide(guide: CombinedStyleGuide, summary?: string) {
  const sections = styleGuideSectionNames.map((name) => `## ${name}\n${guide[name]}`);
  return [...(summary ? [`> ${summary}`] : []), ...sections].join("\n\n");
}

export const combinedStyleGuidePlanning = `For each direction containing multiple selected Motion Graphics, return one project-specific combinedStyleGuide with all 11 sections: ${styleGuideSectionNames.join(", ")}. Read the complete selected style guides before writing it. Use the primary style for the shared visual identity. Give each supporting style a named technique and a specific scene, beat or layer. Resolve competing recommendations into one workable treatment. Respect explicit style scopes, approved assets and exact copy. The idea settings control music, effects, narration, silence, language, subtitles and the composition renderer. Keep preview audio silent. Explain how the settings affect the creative choices. Kiteva supplies the exact effective values before authoring. State concrete choices and checks that the authoring model can follow.`;

export function formatVideoBuildGuide(guide: CombinedStyleGuide, summary?: string) {
  const sections = formatStyleGuide(guide, summary);
  return `# Video build guide\n\nUse these 11 sections as the main authoring instructions. Effective settings are supplied by Kiteva and take precedence over creative suggestions. Use approved film copy as content. Read the supporting references for the original idea, source material and build requirements.\n\n${sections}\n\n`;
}
