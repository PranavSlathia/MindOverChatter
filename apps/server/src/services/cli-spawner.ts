// ── Generic CLI Spawner ────────────────────────────────────────────
// Shared utility for spawning CLI tools (claude, gemini, codex) and
// collecting their JSON output. Extracts the duplicated Haiku spawn
// pattern from session-supervisor.ts and response-validator.ts into
// a single function with CLI-specific adaptations.
//
// All spawns: stdin pipe, /tmp cwd, CLAUDECODE stripped, timeout+SIGTERM.

import { spawn } from "node:child_process";
import { Codex } from "@openai/codex-sdk";
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
  // Gemini CLI: -p for headless mode, -s for sandbox (skips tool confirmation,
  // reduces startup time from ~18s to ~10s by avoiding full tool initialization).
  const args: string[] = ["-s"];
  if (model) {
    args.push("--model", model);
  }
  return args;
}

function getCodexArgs(model?: string): string[] {
  // Codex CLI uses `codex exec` for non-interactive execution.
  // The prompt is passed as a positional arg (NOT -p, which means --profile).
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
      // Skip auth error results — "Not logged in" must never be treated as valid output
      if (event.is_error === true) continue;
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
 * These CLIs may wrap JSON in markdown code fences (```json ... ```).
 * Strip fences before returning so JSON.parse works downstream.
 */
function parsePlainOutput(raw: string): string | null {
  let trimmed = raw.trim();
  if (!trimmed) return null;

  // Strip markdown code fences: ```json\n...\n``` or ```\n...\n```
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch?.[1]) {
    trimmed = fenceMatch[1].trim();
  }

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
  console.log(`[${label}] spawning ${cli} (model=${model ?? "default"}, prompt=${prompt.length} chars, timeout=${timeoutMs}ms)`);

  return new Promise((resolve) => {
    let stdout = "";
    let settled = false;

    const settle = (val: string | null) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    // Strip CLAUDECODE to avoid nested-session guard.
    // Set CLAUDE_PLUGIN_ROOT to /dev/null to prevent global plugins
    // (like claude-mem) from loading and firing hooks on sub-spawns.
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;
    cleanEnv.CLAUDE_PLUGIN_ROOT = "/dev/null";

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
    // For Gemini: prompt via -p flag (required for headless mode)
    // For Codex: prompt as positional arg (-p means --profile in Codex, NOT --prompt)
    if (cli === "gemini") {
      args.push("-p", prompt);
    } else if (cli === "codex") {
      args.push(prompt);
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

    let stderr = "";
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0 && stderr) {
        console.warn(`[${label}] exit code ${code}, stderr: ${stderr.slice(0, 200)}`);
      }
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

// ── Codex SDK singleton ───────────────────────────────────────────
// Uses local CLI login (no API key needed). The SDK wraps the `codex`
// CLI binary and communicates via stdin/stdout JSONL.
let codexInstance: Codex | null = null;
function getCodexSdk(): Codex {
  if (!codexInstance) {
    codexInstance = new Codex();
  }
  return codexInstance;
}

/**
 * Run a prompt through the Codex SDK (uses local CLI login, no API key).
 *
 * Replaces the old CLI spawn approach. The SDK handles all the JSONL
 * communication with the codex binary under the hood.
 *
 * @returns The agent's text response, or null on failure/timeout.
 */
export async function spawnWithCodexSdk(options: {
  prompt: string;
  timeoutMs: number;
  label: string;
}): Promise<string | null> {
  const { prompt, timeoutMs, label } = options;

  try {
    const codex = getCodexSdk();
    const thread = codex.startThread({
      model: env.CODEX_MODEL,
      workingDirectory: "/tmp",
      skipGitRepoCheck: true,
      approvalPolicy: "never",
      sandboxMode: "read-only",
      modelReasoningEffort: "medium",
    });

    // Race the SDK call against a timeout
    const result = await Promise.race([
      thread.run(prompt),
      new Promise<null>((resolve) => {
        setTimeout(() => {
          console.warn(`[${label}/codex-sdk] timeout after ${timeoutMs}ms`);
          resolve(null);
        }, timeoutMs);
      }),
    ]);

    if (!result) return null;

    const text = result.finalResponse ?? "";
    if (text) {
      console.log(`[${label}/codex-sdk] succeeded (${text.length} chars)`);
    } else {
      console.warn(`[${label}/codex-sdk] empty response`);
      return null;
    }

    return text;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[${label}/codex-sdk] error: ${message}`);
    return null;
  }
}

/**
 * Primary lightweight model for supervisor/validator tasks.
 * Uses Codex SDK (local CLI login, no API key).
 * Falls back gracefully — returns null if Codex is unavailable.
 *
 * @returns The raw output string, or null on failure.
 */
export async function spawnWithGeminiFallback(options: {
  prompt: string;
  timeoutMs: number;
  label: string;
}): Promise<string | null> {
  return spawnWithCodexSdk(options);
}
