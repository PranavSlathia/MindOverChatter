// ── Research Promote ─────────────────────────────────────────────
// Phase 3 dependency — NOT YET IMPLEMENTED.
//
// This file is a stub. The promote workflow is the only place in the
// research module that is permitted to call upsertBlock (Rule 1 in
// research/README.md).
//
// Phase 3 will implement:
//   - Load the research_calibration_proposals row by runId
//   - Verify gateDecision === 'keep' and promotedAt is null
//   - Call upsertBlock to write proposed_content to memory_blocks
//   - Stamp promoted_at and promoted_by on the research row
//   - Return a PromoteResult for the CLI runner to display

export interface PromoteResult {
  success: boolean;
  runId: string;
  experiment: string;
  message: string;
}

/**
 * Phase 3 stub — promotes a gate-approved research proposal to live state.
 * Currently returns a not-implemented error. Will be implemented in Phase 3.
 */
export async function promote(runId: string, experiment: string): Promise<PromoteResult> {
  return {
    success: false,
    runId,
    experiment,
    message:
      "promote() is a Phase 3 dependency and has not been implemented yet. " +
      "To promote a proposal, implement research/lib/promote.ts in Phase 3.",
  };
}
