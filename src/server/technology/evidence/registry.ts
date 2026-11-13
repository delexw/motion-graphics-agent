import { SourceCodeUsageEvidenceDetector } from "./source-code";
import { BrowserUsageEvidenceDetector } from "./browser";
import { PythonAssetEvidenceDetector } from "./python";
import { RendererEvidenceDetector } from "./renderer";
import type { TechnologyEvidenceContext, TechnologyUsageDetector } from "./contracts";
const detectors: readonly TechnologyUsageDetector[] = [
  new SourceCodeUsageEvidenceDetector(),
  new BrowserUsageEvidenceDetector(),
  new PythonAssetEvidenceDetector(),
  new RendererEvidenceDetector(),
];
export async function collectTechnologyUsage(context: TechnologyEvidenceContext) {
  return [
    ...new Set((await Promise.all(detectors.map((detector) => detector.detect(context)))).flat()),
  ];
}
