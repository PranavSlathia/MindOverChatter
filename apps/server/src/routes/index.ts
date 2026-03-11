import { Hono } from "hono";
import health from "./health.js";
import sessions from "./sessions.js";
import assessments from "./assessments.js";
import emotions from "./emotions.js";
import moodLogs from "./mood-logs.js";

const app = new Hono()
  .route("/", health)
  .route("/api/sessions", sessions)
  .route("/api/assessments", assessments)
  .route("/api/emotions", emotions)
  .route("/api/mood-logs", moodLogs);

export type AppType = typeof app;
export { app };
