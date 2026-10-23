import type { ResearchQuestion, ResearchStation } from "./contracts";

/** Priority is evidence-derived; age prevents incidental identifiers from deciding the agenda.
 * Semantic ties use target/kind/frozen tool digest, never the question's display title or hash ID.
 */
export function selectResearchQuestion(station: ResearchStation): ResearchQuestion | undefined {
  const semanticKey = (question: ResearchQuestion) => [
    question.subjectId, question.kind,
    station.tools.find((tool) => tool.id === question.toolId)?.digest ?? "",
  ].join("\0");
  return station.questions.filter((question) => question.status === "pending")
    .sort((left, right) => right.priority - left.priority || left.createdAtRound - right.createdAtRound || semanticKey(left).localeCompare(semanticKey(right)))[0];
}
