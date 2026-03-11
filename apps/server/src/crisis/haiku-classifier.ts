import { spawn } from "node:child_process";
import type { HaikuResult } from "./types.js";

/** Timeout for the Haiku classification call (milliseconds) */
const HAIKU_TIMEOUT_MS = 5_000;

/**
 * The classification prompt sent to Claude Haiku.
 * This is a CLASSIFIER — it does NOT generate therapeutic responses.
 * It returns structured JSON indicating risk level.
 */
function buildClassificationPrompt(message: string): string {
  return `You are a crisis risk classifier for a mental wellness app. Your ONLY job is to classify the risk level of a user message. You are NOT a therapist. Do NOT provide advice, comfort, or therapeutic responses.

Classify the following user message into one of these risk levels:
- "crisis": Active suicidal ideation, self-harm intent, immediate danger to self or others
- "elevated": Passive ideation, hopelessness, expressions suggesting the person may be at risk but not in immediate danger
- "low": Mild distress, sadness, frustration, but no indication of danger
- "none": No risk indicators detected

The user may write in English, Hindi, Hinglish (Hindi-English mix), or transliterated Hindi.

Respond with ONLY a JSON object in this exact format, no other text:
{"risk_level": "crisis|elevated|low|none", "reasoning": "brief explanation", "confidence": 0.0-1.0}

User message: "${message.replace(/"/g, '\\"')}"`;
}

/**
 * Spawns the local claude binary as a child process and captures its output.
 * Returns the raw stdout string or null on failure/timeout.
 */
function spawnClaude(prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (value: string | null) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const child = spawn("claude", ["--model", "haiku", "--print", "--max-turns", "1", prompt]);

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      settle(null);
    }, HAIKU_TIMEOUT_MS);

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      console.error("[crisis/haiku] spawn error:", err.message);
      settle(null);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.error(`[crisis/haiku] claude exited with code ${String(code)}: ${stderr}`);
        settle(null);
      } else {
        settle(stdout.trim());
      }
    });
  });
}

/**
 * Attempts to parse the Haiku JSON response.
 * Handles cases where the model wraps JSON in markdown code fences.
 */
function parseHaikuResponse(raw: string): HaikuResult | null {
  // Strip markdown code fences if present
  let cleaned = raw;
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    const parsed: unknown = JSON.parse(cleaned);

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "risk_level" in parsed &&
      "reasoning" in parsed &&
      "confidence" in parsed
    ) {
      const obj = parsed as Record<string, unknown>;
      const risk_level = obj.risk_level;
      const reasoning = obj.reasoning;
      const confidence = obj.confidence;

      // Validate risk_level
      if (
        risk_level !== "crisis" &&
        risk_level !== "elevated" &&
        risk_level !== "low" &&
        risk_level !== "none"
      ) {
        console.error("[crisis/haiku] invalid risk_level:", risk_level);
        return null;
      }

      // Validate types
      if (typeof reasoning !== "string" || typeof confidence !== "number") {
        console.error("[crisis/haiku] invalid field types");
        return null;
      }

      return {
        risk_level,
        reasoning,
        confidence: Math.max(0, Math.min(1, confidence)),
        stage: "haiku",
      };
    }

    console.error("[crisis/haiku] missing required fields in response");
    return null;
  } catch {
    console.error("[crisis/haiku] failed to parse JSON:", cleaned.slice(0, 200));
    return null;
  }
}

/**
 * Stage 2: LLM-based crisis classification using local Claude (Haiku model).
 *
 * Shells out to the local `claude` binary for nuanced classification.
 * This is a CLASSIFIER — it does NOT generate therapeutic responses.
 *
 * Falls back gracefully: if the binary fails, times out, or returns
 * unparseable output, returns null (caller should use keyword result).
 *
 * @param message - The user's message to classify
 * @returns HaikuResult or null on failure
 */
export async function classifyWithHaiku(message: string): Promise<HaikuResult | null> {
  const prompt = buildClassificationPrompt(message);
  const raw = await spawnClaude(prompt);

  if (raw === null) {
    console.warn(
      "[crisis/haiku] classification failed or timed out — falling back to keyword result",
    );
    return null;
  }

  const result = parseHaikuResponse(raw);

  if (result === null) {
    console.warn("[crisis/haiku] could not parse response — falling back to keyword result");
    return null;
  }

  return result;
}
