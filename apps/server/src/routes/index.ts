import { Hono } from "hono";
import assessments from "./assessments.js";
import emotions from "./emotions.js";
import health from "./health.js";
import moodLogs from "./mood-logs.js";
import sessions from "./sessions.js";
import voice from "./voice.js";

const app = new Hono()
  .route("/", health)
  .route("/api/sessions", sessions)
  .route("/api/assessments", assessments)
  .route("/api/emotions", emotions)
  .route("/api/mood-logs", moodLogs)
  .route("/api", voice);

export type AppType = typeof app;
export { app };
