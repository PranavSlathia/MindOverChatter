import { execSync } from "node:child_process";
import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { app } from "./routes/index.js";
import { startOrphanSweep } from "./session/orphan-sweep.js";
import { startFormulationScheduler } from "./services/formulation-service.js";
import { registerSessionHooks } from "./hooks/session-hooks.js";
import { assertHookContract } from "./sdk/session-lifecycle.js";
import { spawnClaudeStreaming } from "./sdk/session-manager.js";

registerSessionHooks();
// Fail fast if any required SOP hook is missing or has the wrong execution class
assertHookContract({
  onStart: ["memory-blocks-injection", "therapy-plan-injection"],
  onEnd: [
    { name: "session-summary", priority: "critical" },
    { name: "formulation", priority: "background" },
    { name: "therapy-plan", priority: "background" },
    { name: "therapeutic-calibration", priority: "background" },
  ],
});

// ── Claude CLI auth check ────────────────────────────────────────
// Verify the local `claude` CLI is installed and authenticated
// before accepting any requests. This catches missing auth early.
try {
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;
  const authOutput = execSync("claude auth status", {
    env: cleanEnv,
    timeout: 5000,
    encoding: "utf-8",
  });
  const auth = JSON.parse(authOutput);
  if (auth.loggedIn) {
    console.log(`Claude CLI authenticated as ${auth.email} (${auth.authMethod})`);
  } else {
    console.error("WARNING: Claude CLI is NOT logged in.");
    console.error("Run 'claude' in a separate terminal and follow the login prompts.");
    console.error("AI responses will fail until you authenticate.");
  }
} catch (err) {
  console.error("WARNING: Could not verify Claude CLI auth.");
  console.error("Make sure 'claude' is installed and run 'claude' to log in.");
  console.error("AI responses will fail until the CLI is available and authenticated.");
}

console.log(`Server starting on port ${env.PORT}`);

serve({
  fetch: app.fetch,
  port: env.PORT,
});

// Start the orphan session sweep (runs every 5 minutes)
const stopSweep = startOrphanSweep();

// Start background formulation regeneration (runs every 2 hours)
startFormulationScheduler();

// Fire-and-forget: prime OS page cache for claude binary so first real
// session response has lower latency. 2s delay ensures the server is
// fully ready before the warm-up spawn starts.
setTimeout(() => {
  console.log("[pre-warm] Starting Claude CLI warm-up...");
  const start = Date.now();
  spawnClaudeStreaming("Respond with: OK", () => {})
    .then(() => {
      console.log(`[pre-warm] Claude CLI warm-up complete (${Date.now() - start}ms)`);
    })
    .catch((err: unknown) => {
      console.warn(
        "[pre-warm] Warm-up failed (non-fatal):",
        err instanceof Error ? err.message : err,
      );
    });
}, 2000);

// Graceful shutdown
process.on("SIGTERM", () => {
  stopSweep();
  process.exit(0);
});

process.on("SIGINT", () => {
  stopSweep();
  process.exit(0);
});

console.log(`Server running at http://localhost:${env.PORT}`);
