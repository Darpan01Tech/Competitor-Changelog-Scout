export type DemoDecision = "accepted" | "rejected";
export type SessionDemoDecisions = Record<string, DemoDecision>;

export function applyDemoDecision(
  decisions: SessionDemoDecisions,
  entryId: string,
  decision: DemoDecision,
): SessionDemoDecisions {
  if (decisions[entryId]) return decisions;
  return { ...decisions, [entryId]: decision };
}

export function isDemoPending(
  entry: { id: string; approval_status: string | null },
  decisions: SessionDemoDecisions,
) {
  return entry.approval_status === "pending" && !decisions[entry.id];
}
