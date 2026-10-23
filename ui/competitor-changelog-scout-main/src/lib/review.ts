export type ReviewDecision = "approved" | "rejected";

export function reviewUpdate(decision: ReviewDecision, reviewer: string, now = new Date()) {
  const name = reviewer.trim();
  if (!name) throw new Error("Enter the reviewer’s name before making a decision.");
  return {
    approval_status: decision,
    approved: decision === "approved",
    approved_by: name,
    approved_at: now.toISOString(),
  };
}

export function isPending(entry: { approval_status: string | null }) {
  return entry.approval_status === "pending";
}

export function verificationStatus(status: string | null) {
  return status === "match" || status === "mismatch" ? status : "unverified";
}