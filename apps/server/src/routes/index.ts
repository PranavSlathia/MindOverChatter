import { Hono } from "hono";
import health from "./health.js";
import sessions from "./sessions.js";

const app = new Hono()
  .route("/", health)
  .route("/api/sessions", sessions);

export type AppType = typeof app;
export { app };
