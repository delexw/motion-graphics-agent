import { z } from "zod";

export const sceneBackgroundPurpose = "Video background selection";
export const sceneBackgroundQuestion = "background";
export const SceneBackgroundTreatmentSchema = z.enum(["required", "not_required", "both"]);
export type SceneBackgroundTreatment = z.infer<typeof SceneBackgroundTreatmentSchema>;
