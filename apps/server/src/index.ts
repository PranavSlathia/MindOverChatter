import { execSync } from "node:child_process";
import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { app } from "./routes/index.js";
import { startOrphanSweep } from "./session/orphan-sweep.js";

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
