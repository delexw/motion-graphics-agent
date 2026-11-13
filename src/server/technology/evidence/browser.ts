import type { TechnologyEvidenceContext, TechnologyUsageDetector } from "./contracts";
export class BrowserUsageEvidenceDetector implements TechnologyUsageDetector {
  async detect(context: TechnologyEvidenceContext) {
    const { id, chosen, observation, browserLoaded, observationUnchanged } = context;
    const usageEvidence: string[] = [];
    if (browserLoaded) usageEvidence.push("Browser loaded");
    if (
      observation?.native &&
      Object.hasOwn(observation.native, id) &&
      observation.native[id as keyof typeof observation.native] &&
      (await observationUnchanged())
    ) {
      usageEvidence.push(
        (
          {
            html_css: "HTML/CSS observed",
            svg: "SVG elements observed",
            webgl: "WebGL context created",
          } as Record<string, string>
        )[id],
      );
    }
    const runtimeVersion = observation?.runtimeLibraries?.[id];
    const expectedVersion = id === "three_js" ? chosen?.version?.split(".")[1] : chosen?.version;
    if (
      ["three_js", "paper_js"].includes(id) &&
      chosen?.ecosystem === "npm" &&
      runtimeVersion &&
      runtimeVersion === expectedVersion &&
      (await observationUnchanged())
    )
      usageEvidence.push("Runtime version observed");
    return usageEvidence;
  }
}
