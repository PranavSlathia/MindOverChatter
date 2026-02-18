import { serve } from "@hono/node-server";
import { app } from "./routes/index.js";

const port = Number(process.env.PORT) || 3000;

console.log(`Server starting on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running at http://localhost:${port}`);
