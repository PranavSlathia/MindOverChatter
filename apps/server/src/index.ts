import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { app } from "./routes/index.js";
import { startOrphanSweep } from "./session/orphan-sweep.js";

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
