// ── Settings Routes ────────────────────────────────────────────
// GET  /cli-status   — Check installed + auth status of CLI tools
// POST /cli-login    — Trigger interactive login for a CLI tool

import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

// ── Types ─────────────────────────────────────────────────────

interface CliToolStatus {
  installed: boolean;
  loggedIn: boolean;
  email?: string;
  model?: string;
  loginCommand?: string;
}

interface CliStatusResponse {
  claude: CliToolStatus;
  gemini: CliToolStatus;
  codex: CliToolStatus;
}

// ── Helpers ───────────────────────────────────────────────────

const CLI_TIMEOUT_MS = 5_000;

function cleanProcessEnv(): Record<string, string | undefined> {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return env;
}

function isInstalled(binary: string): boolean {
  try {
    execSync(`which ${binary}`, { timeout: CLI_TIMEOUT_MS, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ── Claude ───────────────────────────────────────────────────

function getClaudeStatus(): CliToolStatus {
  if (!isInstalled("claude")) {
    return { installed: false, loggedIn: false, loginCommand: "npm install -g @anthropic-ai/claude-code && claude" };
  }

  try {
    const output = execSync("claude auth status", {
      timeout: CLI_TIMEOUT_MS,
      stdio: "pipe",
      env: cleanProcessEnv(),
      cwd: "/tmp",
    }).toString();

    // Claude outputs JSON: {"loggedIn": true, "authMethod": "...", "email": "..."}
    try {
      const parsed = JSON.parse(output) as { loggedIn?: boolean; email?: string };
      const model = process.env.CLAUDE_MODEL ?? "sonnet";
      return {
        installed: true,
        loggedIn: parsed.loggedIn === true,
        email: parsed.email,
        model: parsed.loggedIn ? model : undefined,
        loginCommand: "claude",
      };
    } catch {
      // Fallback: text parsing
      const loggedIn = /loggedIn.*true/i.test(output) || /logged in/i.test(output);
      return { installed: true, loggedIn, loginCommand: "claude" };
    }
  } catch {
    return { installed: true, loggedIn: false, loginCommand: "claude" };
  }
}

// ── Gemini ───────────────────────────────────────────────────

function getGeminiStatus(): CliToolStatus {
  if (!isInstalled("gemini")) {
    return { installed: false, loggedIn: false, loginCommand: "npm install -g @anthropic-ai/gemini-cli && gemini" };
  }

  // Gemini CLI has no `auth status` command.
  // Check for cached credentials file instead.
  const credPath = join(homedir(), ".gemini", "google_accounts.json");
  const hasCreds = existsSync(credPath);

  return {
    installed: true,
    loggedIn: hasCreds,
    loginCommand: "gemini",
  };
}

// ── Codex ────────────────────────────────────────────────────

function getCodexStatus(): CliToolStatus {
  if (!isInstalled("codex")) {
    return { installed: false, loggedIn: false, loginCommand: "npm install -g @openai/codex && codex" };
  }

  try {
    const output = execSync("codex login status", {
      timeout: CLI_TIMEOUT_MS,
      stdio: "pipe",
      env: cleanProcessEnv(),
      cwd: "/tmp",
    }).toString();

    // Codex outputs: "Logged in using ChatGPT" or "Logged in using API key"
    const loggedIn = /logged in/i.test(output);
    return { installed: true, loggedIn, loginCommand: "codex" };
  } catch {
    return { installed: true, loggedIn: false, loginCommand: "codex" };
  }
}

// ── Login Process Management ────────────────────────────────

// Track active login processes so we can report status
const activeLogins = new Map<string, { pid: number; startedAt: number }>();

function startLoginProcess(tool: "claude" | "gemini" | "codex"): { success: boolean; message: string } {
  if (activeLogins.has(tool)) {
    return { success: false, message: `Login already in progress for ${tool}` };
  }

  let command: string;
  let args: string[];

  switch (tool) {
    case "claude":
      command = "claude";
      args = [];
      break;
    case "gemini":
      command = "gemini";
      args = [];
      break;
    case "codex":
      command = "codex";
      args = [];
      break;
  }

  try {
    // Spawn the login process in the background
    // These CLIs open a browser for OAuth — the user completes login there
    const child = spawn(command, args, {
      env: cleanProcessEnv(),
      cwd: "/tmp",
      detached: true,
      stdio: "ignore",
    });

    child.unref();

    if (child.pid) {
      activeLogins.set(tool, { pid: child.pid, startedAt: Date.now() });

      // Clean up after 5 minutes (login should be done by then)
      setTimeout(() => {
        activeLogins.delete(tool);
      }, 5 * 60 * 1000);
    }

    return {
      success: true,
      message: `${tool} login started. Complete the authentication in your browser, then click "Check Status" to verify.`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to start ${tool}: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

// ── Routes ────────────────────────────────────────────────────

const app = new Hono()
  .get("/cli-status", (c) => {
    const status: CliStatusResponse = {
      claude: getClaudeStatus(),
      gemini: getGeminiStatus(),
      codex: getCodexStatus(),
    };
    return c.json(status);
  })
  .post(
    "/cli-login",
    zValidator("json", z.object({ tool: z.enum(["claude", "gemini", "codex"]) })),
    (c) => {
      const { tool } = c.req.valid("json");
      const result = startLoginProcess(tool);
      return c.json(result, result.success ? 200 : 409);
    },
  );

export type SettingsRoutes = typeof app;
export default app;
