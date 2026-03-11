import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { app } from "./routes/index.js";

console.log(`Server starting on port ${env.PORT}`);

serve({
  fetch: app.fetch,
  port: env.PORT,
});

console.log(`Server running at http://localhost:${env.PORT}`);
