// ── Settings Routes ────────────────────────────────────────────
// GET /cli-status  — Check installed + auth status of CLI tools (Claude, Gemini, Codex)

import { execSync } from "node:child_process";
import { Hono } from "hono";

// ── Types ─────────────────────────────────────────────────────

interface CliToolStatus {
  installed: boolean;
  loggedIn: boolean;
  email?: string;
  model?: string;
}

interface CliStatusResponse {
  claude: CliToolStatus;
  gemini: CliToolStatus;
  codex: CliToolStatus;
}

// ── Helpers ───────────────────────────────────────────────────

const CLI_TIMEOUT_MS = 3_000;

/**
 * Check if a CLI binary is available on the system PATH.
 */
function isInstalled(binary: string): boolean {
  try {
    execSync(`which ${binary}`, { timeout: CLI_TIMEOUT_MS, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check Claude CLI auth status.
 * Spawns `claude auth status` and parses the text output.
 * Strips CLAUDECODE env var to avoid nested-session guard.
 */
function getClaudeStatus(): CliToolStatus {
  if (!isInstalled("claude")) {
    return { installed: false, loggedIn: false };
  }

  try {
    // Strip CLAUDECODE from env to avoid "nested session" guard
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;

    const output = execSync("claude auth status", {
      timeout: CLI_TIMEOUT_MS,
      stdio: "pipe",
      env: cleanEnv,
    }).toString();

    // Parse output — typical format includes "Logged in as <email>" or similar
    const loggedIn = /logged in/i.test(output) || /authenticated/i.test(output);
    const emailMatch = output.match(/(?:logged in as|email[:\s]+|account[:\s]+)\s*(\S+@\S+)/i);
    const model = process.env.CLAUDE_MODEL ?? "sonnet";

    return {
      installed: true,
      loggedIn,
      email: emailMatch?.[1],
      model: loggedIn ? model : undefined,
    };
  } catch {
    // CLI installed but auth check failed — could be not logged in or timeout
    return {
      installed: true,
      loggedIn: false,
    };
  }
}

/**
 * Check Gemini CLI status.
 */
function getGeminiStatus(): CliToolStatus {
  if (!isInstalled("gemini")) {
    return { installed: false, loggedIn: false };
  }

  try {
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;

    const output = execSync("gemini auth status", {
      timeout: CLI_TIMEOUT_MS,
      stdio: "pipe",
      env: cleanEnv,
    }).toString();

    const loggedIn = /logged in/i.test(output) || /authenticated/i.test(output);
    return { installed: true, loggedIn };
  } catch {
    return { installed: true, loggedIn: false };
  }
}

/**
 * Check Codex CLI status.
 */
function getCodexStatus(): CliToolStatus {
  if (!isInstalled("codex")) {
    return { installed: false, loggedIn: false };
  }

  // Codex doesn't have an auth command — just check installation
  return { installed: true, loggedIn: false };
}

// ── Routes ────────────────────────────────────────────────────

const app = new Hono().get("/cli-status", (c) => {
  const status: CliStatusResponse = {
    claude: getClaudeStatus(),
    gemini: getGeminiStatus(),
    codex: getCodexStatus(),
  };

  return c.json(status);
});

export default app;
