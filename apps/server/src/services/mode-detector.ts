import type { SessionMode } from "@moc/shared";

// follow_support triggers — distress overrides insight
const FOLLOW_SUPPORT_EN = [
  /\boverwhelmed\b/i,
  /\bcan'?t cope\b/i,
  /\bbreaking down\b/i,
  /\bleave me alone\b/i,
  /\bi hate this\b/i,
  /\bcrying\b/i,
  /\bi'?m scared\b/i,
  /\bplease help\b/i,
  /\bwhat'?s the point\b/i,
  /\bstop asking\b/i,
];

const FOLLOW_SUPPORT_HI = [
  /bahut zyada ho gaya/i,
  /thak gay[ai]/i,
  /toot gay[ai]/i,
  /mujhe chod do/i,
  /rona aa raha/i,
  /dar lag raha/i,
  /bas karo/i,
];

// challenge_pattern triggers — only if not already in distress
const CHALLENGE_PATTERN_EN = [
  /\bi'?ve realized\b/i,
  /\bi think i see\b/i,
  /\bit'?s making sense\b/i,
  /\bi see a pattern\b/i,
  /\bmaybe it'?s because\b/i,
  /\bi'?ve been thinking\b/i,
  /\bi want to understand\b/i,
];

const CHALLENGE_PATTERN_HI = [
  /ab samajh aa gay[ai]/i,
  /shayad main/i,
  /pattern dikh raha/i,
  /main badalna chahta/i,
  /main badalna chahti/i,
];

/**
 * Detects if a mode shift is warranted based on the user's message.
 * Pure function — no DB or LLM calls.
 * Returns the target mode, or null if no shift is needed.
 *
 * Precedence: follow_support always wins over challenge_pattern.
 * Authority clamp: "low" directive_authority blocks challenge_pattern shifts
 * (the companion should follow and support, not challenge, when authority is low).
 */
export function detectModeShift(
  message: string,
  currentMode: SessionMode | null,
  directiveAuthority?: "low" | "medium" | "high" | null,
): SessionMode | null {
  // Check follow_support first (distress always wins, regardless of authority)
  const isFollowSupport =
    FOLLOW_SUPPORT_EN.some((r) => r.test(message)) ||
    FOLLOW_SUPPORT_HI.some((r) => r.test(message));

  if (isFollowSupport) {
    return currentMode === "follow_support" ? null : "follow_support";
  }

  // A4: Authority clamp — "low" blocks challenge_pattern shifts
  // When the therapy plan recommends low authority, we should not push the user
  // toward examining their thinking patterns even if they show insight signals.
  if (directiveAuthority === "low") {
    return null;
  }

  // Check challenge_pattern (only if not distressed and authority allows)
  const isChallengePattern =
    CHALLENGE_PATTERN_EN.some((r) => r.test(message)) ||
    CHALLENGE_PATTERN_HI.some((r) => r.test(message));

  if (isChallengePattern) {
    // Precedence: follow_support is a lock state.
    // Don't shift to challenge_pattern while the session is still in distress mode —
    // the user must reach a neutral mode first before insight-seeking shifts are offered.
    if (currentMode === "follow_support") return null;
    return currentMode === "challenge_pattern" ? null : "challenge_pattern";
  }

  return null;
}
