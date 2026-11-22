import { z } from "zod";
import type { Run, StyleCandidate } from "../../shared/contracts";
import { directionCandidateId } from "../../shared/direction-rounds";
import { combinationCandidateId } from "../../shared/style-combinations";

const proposalsOutput = z.object({
  value: z.object({
    options: z.array(
      z.object({ primaryStyleId: z.string(), supportingStyleIds: z.array(z.string()) }),
    ),
  }),
});

export function combinationSelections(run: Run) {
  const checkpoint = run.preparation?.checkpoints.proposals;
  const proposals = proposalsOutput.safeParse(
    checkpoint?.state === "completed" ? checkpoint.output : null,
  );
  const round = run.directionRound || 0;
  const options = new Map<string, string[]>();
  if (proposals.success) {
    for (const [index, proposal] of proposals.data.value.options.entries()) {
      options.set(combinationCandidateId(index), [
        proposal.primaryStyleId,
        ...proposal.supportingStyleIds,
      ]);
    }
  }

  // Confirm that the saved proposals belong to the selected directions before
  // recovering comparisons written before each round stored its own styles.
  const savedProposalsMatch = run.candidates.every((candidate) =>
    [...options].some(
      ([id, styles]) =>
        directionCandidateId(round, id) === candidate.id &&
        styles.length === candidate.supportingStyleIds.length + 1 &&
        styles[0] === candidate.primaryStyleId &&
        candidate.supportingStyleIds.every((style, index) => styles[index + 1] === style),
    ),
  );
  const selected = new Map(
    run.candidates.map((candidate) => [
      candidate.id,
      [candidate.primaryStyleId, ...candidate.supportingStyleIds],
    ]),
  );

  return (candidate: StyleCandidate): StyleCandidate["selectionDecision"] => {
    const decision = candidate.selectionDecision;
    if (!decision || decision.comparedStyles) return decision;

    const comparedStyles: Record<string, string[]> = {};
    for (const id of decision.comparedIds) {
      const styles =
        (savedProposalsMatch ? options.get(id) : undefined) ??
        selected.get(directionCandidateId(round, id));
      if (styles) comparedStyles[id] = styles;
    }
    return { ...decision, comparedStyles };
  };
}
