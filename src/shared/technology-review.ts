import { motionGraphicTechnologyPool, projectRenderTechnologyPool } from "./technology-pool";

export { TechnologyReviewSchema } from "./agents/schemas/technology-review";
import { TechnologyReviewSchema } from "./agents/schemas/technology-review";

export function technologyReviewedPrompt(
  template: string,
  previousImplementation: string,
  implementation: string,
  rationale: string,
) {
  const marker = "\nReviewed technology choice:";
  const source = template.split(marker)[0];
  const updated = previousImplementation
    ? source.replace(previousImplementation, implementation)
    : source;
  return `${updated}${marker} ${implementation} ${rationale}`;
}

export function validateTechnologyReview(input: unknown, expectedStyleIds: string[]) {
  const review = TechnologyReviewSchema.parse(input);
  const poolKeys = Object.keys(motionGraphicTechnologyPool);
  const assessedKeys = review.assessments.map((assessment) => assessment.key);
  if (
    assessedKeys.length !== poolKeys.length ||
    new Set(assessedKeys).size !== poolKeys.length ||
    poolKeys.some((key) => !assessedKeys.includes(key))
  )
    throw Error("Technology review must assess every pool key exactly once");
  const styleIds = review.styles.map((style) => style.styleId);
  if (
    styleIds.length !== expectedStyleIds.length ||
    new Set(styleIds).size !== styleIds.length ||
    expectedStyleIds.some((id) => !styleIds.includes(id))
  )
    throw Error("Technology review must cover every requested Motion Graphic exactly once");
  for (const assessment of review.assessments) {
    if (
      assessment.matchingStyleIds.some((id) => !expectedStyleIds.includes(id)) ||
      new Set(assessment.matchingStyleIds).size !== assessment.matchingStyleIds.length
    )
      throw Error(`Invalid technology assessment: ${assessment.key}`);
  }
  for (const style of review.styles) {
    const keys = [...style.rendererKeys, ...style.motionKeys, ...style.supportingKeys];
    if (keys.some((key) => Object.hasOwn(projectRenderTechnologyPool, key)))
      throw Error("Composition pipelines cannot be selected in a Motion Graphic technology review");
    if (
      keys.some((key) => !Object.hasOwn(motionGraphicTechnologyPool, key)) ||
      new Set(keys).size !== keys.length
    )
      throw Error(`Invalid technology selection: ${style.styleId}`);
    if (
      keys.some(
        (key) =>
          !review.assessments
            .find((entry) => entry.key === key)
            ?.matchingStyleIds.includes(style.styleId),
      )
    )
      throw Error(`Selected technology lacks a matching assessment: ${style.styleId}`);
  }
  return review;
}
