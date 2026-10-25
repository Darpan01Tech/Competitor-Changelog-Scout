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

export function resetDemoDecisions(): SessionDemoDecisions {
  return {};
}

export function getDemoPendingCount(
  entries: Array<{ id: string; approval_status: string | null }>,
  decisions: SessionDemoDecisions,
): number {
  return entries.filter((entry) => isDemoPending(entry, decisions)).length;
}

export function getDemoReviewedEntries<T extends { id: string }>(
  entries: T[],
  decisions: SessionDemoDecisions,
): Array<T & { decision: DemoDecision }> {
  return entries
    .filter((entry) => Boolean(decisions[entry.id]))
    .map((entry) => ({
      ...entry,
      decision: decisions[entry.id] as DemoDecision,
    }));
}
