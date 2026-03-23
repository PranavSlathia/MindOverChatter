// ── Generic CLI Spawner ────────────────────────────────────────────
// Shared utility for spawning CLI tools (claude, gemini, codex) and
// collecting their JSON output. Extracts the duplicated Haiku spawn
// pattern from session-supervisor.ts and response-validator.ts into
// a single function with CLI-specific adaptations.
//
// All spawns: stdin pipe, /tmp cwd, CLAUDECODE stripped, timeout+SIGTERM.

import { spawn } from "node:child_process";
import { env } from "../env.js";

// ── Types ─────────────────────────────────────────────────────────

export interface CliSpawnOptions {
  cli: "claude" | "gemini" | "codex";
  model?: string;
  prompt: string;
  timeoutMs: number;
  label: string; // for logging prefix
}

// ── CLI Argument Builders ─────────────────────────────────────────

function getClaudeArgs(model?: string): string[] {
  return [
    "--model",
    model ?? env.CLAUDE_HAIKU_MODEL,
    "--print",
    "--verbose",
    "--max-turns",
    "1",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
  ];
}

function getGeminiArgs(model?: string): string[] {
  // Gemini CLI requires -p/--prompt for headless (non-interactive) mode.
  // The prompt is passed via -p flag, NOT stdin.
  const args: string[] = [];
  if (model) {
    args.push("--model", model);
  }
  return args;
}

function getCodexArgs(model?: string): string[] {
  // Codex CLI uses `codex exec` for non-interactive execution.
  // The prompt is passed via -p/--prompt flag, NOT stdin.
  const args: string[] = ["exec"];
  if (model) {
    args.push("--model", model);
  }
  return args;
}

// ── Output Parsers ────────────────────────────────────────────────

/**
 * Parse Claude stream-json output: newline-delimited JSON objects,
 * extract the `result` field from `type: "result"` events.
 */
function parseClaudeStreamJson(raw: string): string | null {
  const lines = raw.split("\n");
  let resultText: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed) as Record<string, unknown>;
      if (event.type === "result" && typeof event.result === "string") {
        resultText = event.result;
      }
    } catch {
      /* skip malformed lines */
    }
  }

  return resultText;
}

/**
 * Parse plain-text output from Gemini/Codex CLIs.
 * These CLIs are expected to output plain text or JSON directly to stdout.
 */
function parsePlainOutput(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ── Spawn Implementation ──────────────────────────────────────────

/**
 * Spawn a CLI tool and return its text output, or null on failure/timeout.
 *
 * - For `claude`: uses stream-json output format, parses result events.
 * - For `gemini`/`codex`: uses plain stdout, returns raw text.
 * - All CLIs: CLAUDECODE env var stripped, /tmp cwd, stdin pipe.
 * - If the CLI binary is not installed, returns null gracefully.
 */
export function spawnCliForJson(options: CliSpawnOptions): Promise<string | null> {
  const { cli, model, prompt, timeoutMs, label } = options;

  return new Promise((resolve) => {
    let stdout = "";
    let settled = false;

    const settle = (val: string | null) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    // Strip CLAUDECODE to avoid nested-session guard
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;

    // Build CLI-specific args
    let binary: string;
    let args: string[];
    switch (cli) {
      case "claude":
        binary = "claude";
        args = getClaudeArgs(model);
        break;
      case "gemini":
        binary = "gemini";
        args = getGeminiArgs(model);
        break;
      case "codex":
        binary = "codex";
        args = getCodexArgs(model);
        break;
    }

    // For Claude: prompt via stdin (avoids ARG_MAX on large prompts)
    // For Gemini/Codex: prompt via -p flag (required for headless mode)
    if (cli !== "claude") {
      args.push("-p", prompt);
    }

    const child = spawn(binary, args, { env: cleanEnv, cwd: "/tmp" });

    if (cli === "claude") {
      child.stdin.write(prompt);
      child.stdin.end();
    }

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      console.warn(`[${label}] timeout after ${timeoutMs}ms`);
      settle(null);
    }, timeoutMs);

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.on("close", () => {
      clearTimeout(timer);
      // Parse based on CLI type
      const parsed = cli === "claude"
        ? parseClaudeStreamJson(stdout)
        : parsePlainOutput(stdout);
      settle(parsed);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      // ENOENT means the binary is not installed — this is expected for
      // optional CLIs (gemini, codex). Log at debug level, not error.
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        console.log(`[${label}] CLI binary '${binary}' not found — skipping`);
      } else {
        console.warn(`[${label}] spawn error:`, (err as Error).message);
      }
      settle(null);
    });
  });
}
