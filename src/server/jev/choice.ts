import { choice } from "@typesafe-ai/sdk";
import { z } from "zod";
import { jevClient, jevModel } from "./client";
import { redactSecrets } from "../runtime/config";
import type { ProviderEvent } from "../agents/agent";

/** Shared native Choice API execution and attribution; strategies own their criteria and policy. */
type ChoiceQuestion = { question: string; criteria: Record<string, string> };

type JevChoiceOptions = ChoiceQuestion & {
  invocationId: string;
  label: string;
  questionKey: string;
  additionalQuestions?: Record<string, ChoiceQuestion>;
  state: unknown;
  signal: AbortSignal;
  onEvent: (event: ProviderEvent) => void;
};

export function jevChoicePayload(
  options: Pick<
    JevChoiceOptions,
    "questionKey" | "question" | "criteria" | "additionalQuestions" | "state"
  >,
) {
  const questions = {
    [options.questionKey]: choice(options.question, options.criteria),
    ...Object.fromEntries(
      Object.entries(options.additionalQuestions ?? {}).map(([key, question]) => [
        key,
        choice(question.question, question.criteria),
      ]),
    ),
  };
  const state = z.record(z.string(), z.json()).parse(JSON.parse(JSON.stringify(options.state)));
  return { model: jevModel, state, questions };
}

function parseAnswer(ids: string[], answer: unknown) {
  if (!ids.length) throw Error("JEV Choice requires at least one available option");
  const idSchema = z.enum(ids);
  return z
    .object({
      type: z.literal("choice"),
      choice: idSchema,
      confidence: z.number().finite().min(0).max(1),
      probabilities: z.record(idSchema, z.number().finite().min(0).max(1)),
    })
    .parse(answer);
}

type ChoiceAnswer = ReturnType<typeof parseAnswer>;

export async function runJevChoice(options: JevChoiceOptions): Promise<{
  model: string;
  answer: ChoiceAnswer;
  additionalAnswers?: Record<string, ChoiceAnswer>;
  comparedIds: string[];
}> {
  options.signal.throwIfAborted();
  const ids = Object.keys(options.criteria);
  if (!ids.length) throw Error("JEV Choice requires at least one available option");
  const additional = Object.entries(options.additionalQuestions ?? {});
  const payload = jevChoicePayload(options);
  options.onEvent({
    type: "invocation",
    message: `${options.label} started`,
    data: {
      provider: "jev",
      model: jevModel,
      invocationId: options.invocationId,
      prompt: {
        system: null,
        user: redactSecrets(JSON.stringify(payload)),
        outputSchema: null,
        reasoningEffort: null,
        note: "JEV Choice API strategy; the SDK does not expose its internal prompt.",
      },
    },
  });
  const result = await jevClient().systemOne(payload, { signal: options.signal });
  options.onEvent({
    type: "usage",
    message: `${options.label} complete`,
    data: {
      provider: "jev",
      model: result.model,
      invocationId: options.invocationId,
      usage: result.usage,
      decision: {
        questionKey: options.questionKey,
        answer: result.answers[options.questionKey],
        comparedIds: ids,
        ...(additional.length
          ? {
              additionalAnswers: Object.fromEntries(
                additional.map(([key]) => [key, result.answers[key]]),
              ),
            }
          : {}),
      },
    },
  });
  options.signal.throwIfAborted();
  return {
    model: result.model,
    answer: parseAnswer(ids, result.answers[options.questionKey]),
    additionalAnswers: Object.fromEntries(
      additional.map(([key, question]) => [
        key,
        parseAnswer(Object.keys(question.criteria), result.answers[key]),
      ]),
    ),
    comparedIds: ids,
  };
}
