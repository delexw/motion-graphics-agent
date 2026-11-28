import { expect, it } from "vitest";
import chroma from "chroma-js";
import { loadCatalog } from "../../src/server/catalog/catalog";
import {
  formatStyleGuide,
  parseStyleGuide,
  styleGuideSectionNames,
} from "../../src/shared/agents/schemas/combined-style-guide";
import { reviewedStylePreviewPrompt } from "../../src/server/catalog/style-preview-authoring";

it("loads all style guides and applies them to preview authoring", async () => {
  const { styles, originalStyles } = await loadCatalog();
  const newStyles = styles.slice(143);

  expect(newStyles).toHaveLength(56);
  expect(styles).toHaveLength(199);
  expect(new Set(styles.map(({ id }) => id)).size).toBe(styles.length);
  expect(originalStyles.filter((style) => Object.hasOwn(style, "selection_summary"))).toEqual([]);

  for (const style of styles) {
    const markdown = style.executable_prompt_template;
    const guide = parseStyleGuide(markdown);
    expect(guide, style.id).toBeDefined();
    expect(guide!.summary.length, style.id).toBeGreaterThan(40);
    expect(guide!.summary, style.id).not.toBe(guide!.sections["Visual identity"]);
    expect(Object.keys(guide!.sections), style.id).toEqual(styleGuideSectionNames);
    expect(formatStyleGuide(guide!.sections, guide!.summary), style.id).toBe(markdown);
    expect(markdown, style.id).not.toMatch(/\{\{\w+\}\}|existing requirements above/);
    expect(markdown, style.id).not.toMatch(
      /\b(?:\d+\s*(?:fps|bpm)|16:9|9:16|4:3|\d{3,4}\s*[×x]\s*\d{3,4})\b/i,
    );

    expect(markdown, style.id).not.toMatch(
      /(?:^|[.\n]\s*)(?:- )?Follow\b|The idea settings control|Compose and export with the idea's renderer/,
    );
    const example = guide!.sections["Colour roles"].match(/Example palette\. ([^.\n]+)\./)?.[1];
    expect(example, style.id).toBeDefined();
    expect(example!.match(/#[0-9A-F]{6}\b/g), style.id).toEqual(
      Object.values(style.palette.tokens).map((colour) => colour.toUpperCase()),
    );
    expect(reviewedStylePreviewPrompt(style, "")).toContain(markdown);
  }

  const unmatchedStyle = styles.find(({ name_en }) => name_en === "Origami")!;
  expect(unmatchedStyle.executable_prompt_template).toContain("Parent facets to a fold hierarchy");
  expect(reviewedStylePreviewPrompt(unmatchedStyle, "")).toContain(
    "Check sheet continuity, crease registration and panel overlap",
  );

  const pixelStyle = newStyles.find(({ id }) => id === "style-166")!;
  expect(pixelStyle.name_en).toBe("2.5D Pixel Art");
  expect(pixelStyle.executable_prompt_template).toContain("nearest-neighbour sprite sampling");
  expect(pixelStyle.executable_prompt_template).toContain("depth-tested scenery");
  const framing = parseStyleGuide(pixelStyle.executable_prompt_template)!.sections[
    "Framing and viewpoint"
  ];
  for (const move of [
    "high three-quarter",
    "lateral walk",
    "Dip closer",
    "Rise and withdraw",
    "Circle partway",
    "overhead view",
    "rack between two depths",
    "Revisit an earlier framing",
    "tilt-shift band",
  ])
    expect(framing).toContain(move);

  const transitMap = newStyles.find(({ name_en }) => name_en === "Transit Map")!;
  expect(transitMap.executable_prompt_template).toContain("Use one contrasting colour per route");
  expect(transitMap.executable_prompt_template).toContain(
    "send the marker through only after the interchange reads",
  );
  expect(transitMap.executable_prompt_template).toContain("Keep the map orientation fixed");
  const prompt = reviewedStylePreviewPrompt(transitMap, "");
  expect(prompt).toContain("Subject: an idea becomes a connected system.");
  expect(prompt).toContain("## Characteristic actions");
  expect(prompt).toContain("## Review checks");
});

it("offers style-specific tools while keeping the export pipeline a project choice", async () => {
  const { styles } = await loadCatalog();
  const additions = styles.slice(143);
  const stacks = additions.map(({ tech }) => tech.recommended_stack.map(({ name }) => name));
  expect(new Set(stacks.map((stack) => stack.join("|"))).size).toBe(additions.length);

  for (const { id, tech, executable_prompt_template } of additions) {
    const tools = tech.recommended_stack;
    expect(tools.length, id).toBeGreaterThan(2);
    expect(
      tools.filter(({ optional }) => optional).every(({ style_application }) => style_application),
      id,
    ).toBe(true);
    expect(
      tools.some(({ production_roles }) => production_roles?.includes("render_pipeline")),
      id,
    ).toBe(false);
    expect(parseStyleGuide(executable_prompt_template)?.sections["Implementation tools"]).toContain(
      tech.implementation,
    );
  }

  const examples = [
    ["2.5D Pixel Art", ["Three.js", "Aseprite", "PixiJS"]],
    ["Transit Map", ["D3", "GSAP DrawSVGPlugin", "Leaflet"]],
    ["Glass Studio Product", ["MeshPhysicalMaterial", "Blender", "Cycles"]],
  ] as const;
  for (const [styleName, expectedTools] of examples) {
    const style = additions.find(({ name_en }) => name_en === styleName)!;
    expect(
      style.tech.recommended_stack.map(({ name }) => name),
      styleName,
    ).toEqual(expect.arrayContaining([...expectedTools]));
  }
  const brick = additions.find(({ name_en }) => name_en === "Brick Miniature")!;
  expect(parseStyleGuide(brick.executable_prompt_template)?.sections["Colour roles"]).toContain(
    "yellow #F2CD37 or green #237841",
  );
});

it("rejects extra headings, missing sections and the old prompt prefix", async () => {
  const {
    styles: [style],
  } = await loadCatalog();
  const markdown = style.executable_prompt_template;
  expect(parseStyleGuide(`Old prompt\n\n${markdown}`)).toBeUndefined();
  expect(parseStyleGuide(markdown.replace(/^> .+\n\n/, ""))).toBeUndefined();
  expect(parseStyleGuide(markdown.replace("## Colour roles", "## Unexpected"))).toBeUndefined();
  expect(parseStyleGuide(markdown + "\n\n## Extra\nAnother section")).toBeUndefined();
  expect(parseStyleGuide(markdown.split("\n\n## Project choices", 1)[0])).toBeUndefined();
});

it("publishes distinct preview palettes and keeps the limited palettes faithful to their guides", async () => {
  const { styles } = await loadCatalog();
  const colourSets = styles.map((style) =>
    Object.values(style.palette.tokens)
      .map((colour) => colour.toUpperCase())
      .sort()
      .join(","),
  );
  expect(new Set(colourSets).size).toBe(styles.length);
  for (const style of styles.slice(143)) {
    const guide = parseStyleGuide(style.executable_prompt_template)!;
    const { background, foreground } = style.palette.tokens;
    expect(chroma.contrast(background, foreground), style.id).toBeGreaterThanOrEqual(4.5);
    expect(
      (guide.sections["Colour roles"].match(/#[0-9A-F]{6}\b/g) ?? []).slice(
        0,
        Object.keys(style.palette.tokens).length,
      ),
      style.id,
    ).toEqual(Object.values(style.palette.tokens));
  }
  expect(styles.find((style) => style.id === "style-145")?.palette.tokens).toEqual({
    background: "#04070A",
    foreground: "#76E1CB",
  });
  expect(styles.find((style) => style.id === "style-178")?.palette.tokens).toEqual({
    background: "#142536",
    foreground: "#EDF1F3",
  });
});

it("keeps concrete production guidance across the whole guide for related and original styles", async () => {
  const { styles } = await loadCatalog();
  const examples = [
    {
      name: "2.5D Pixel Art",
      expected: {
        "Visual identity": "miniature set",
        "Surfaces and construction": "consistent texel size",
        "Colour roles": "ambient and practical",
        "Lettering and captions": "acting silhouettes",
        "Timing and movement": "selected output frame rate",
        "Framing and viewpoint": "narrow strip of sharp focus",
        "Sound options": "nearby light changes",
        "Characteristic actions": "occluding prop",
        "Review checks": "contact shadows during a direct seek",
        "Implementation tools": "depth, sprite pose and light tracks",
        "Project choices": "depth and practical light sources",
      },
    },
    {
      name: "Origami",
      expected: {
        "Visual identity": "successive creases",
        "Surfaces and construction": "opposing paper faces",
        "Colour roles": "face direction and contact shadows",
        "Lettering and captions": "fold will not conceal",
        "Timing and movement": "another that depends on it",
        "Framing and viewpoint": "views along and across the crease",
        "Sound options": "sound of the sheet settling",
        "Characteristic actions": "reverse a fold",
        "Review checks": "most compressed stack",
        "Implementation tools": "key each crease angle explicitly",
        "Project choices": "outline changes in readable stages",
      },
    },
  ];
  for (const { name, expected } of examples) {
    const style = styles.find(({ name_en }) => name_en === name)!;
    const { sections } = parseStyleGuide(style.executable_prompt_template)!;
    for (const heading of styleGuideSectionNames)
      expect(sections[heading], `${name}: ${heading}`).toContain(expected[heading]);
  }
});

it("passes concrete timing, caption placement and lighting decisions to preview authoring", async () => {
  const { styles } = await loadCatalog();
  const cases = [
    {
      name: "Glitch Art",
      section: "Timing and movement",
      details: ["Tear a few contiguous scan bands", "restore them in a visible order"],
    },
    {
      name: "Rotoscoping",
      section: "Lettering and captions",
      details: ["full action path", "another open area on the edit"],
    },
    {
      name: "2.5D Pixel Art",
      section: "Surfaces and construction",
      details: ["soft front fill", "depth-aware focus pass"],
    },
  ] as const;

  for (const { name, section, details } of cases) {
    const style = styles.find(({ name_en }) => name_en === name)!;
    const guide = parseStyleGuide(style.executable_prompt_template)!;
    const previewPrompt = reviewedStylePreviewPrompt(style, "");

    expect(previewPrompt).toContain(guide.sections[section]);
    for (const detail of details) expect(guide.sections[section], name).toContain(detail);
  }
});
