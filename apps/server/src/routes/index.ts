import { Hono } from "hono";
import health from "./health.js";
import sessions from "./sessions.js";
import assessments from "./assessments.js";

const app = new Hono()
  .route("/", health)
  .route("/api/sessions", sessions)
  .route("/api/assessments", assessments);

export type AppType = typeof app;
export { app };
