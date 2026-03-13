import { Hono } from "hono";
import { cors } from "hono/cors";
import assessments from "./assessments.js";
import emotions from "./emotions.js";
import health from "./health.js";
import home from "./home.js";
import journey from "./journey.js";
import moodLogs from "./mood-logs.js";
import sessions from "./sessions.js";
import userProfile from "./user-profile.js";
import voice from "./voice.js";
import { research } from "../research/routes/research.js";

const app = new Hono()
  .use("*", cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }))
  .route("/", health)
  .route("/api/home", home)
  .route("/api/sessions", sessions)
  .route("/api/assessments", assessments)
  .route("/api/emotions", emotions)
  .route("/api/journey", journey)
  .route("/api/mood-logs", moodLogs)
  .route("/api/user", userProfile)
  .route("/api", voice)
  // Research sandbox — route guard inside research.ts enforces RESEARCH_ENABLED=true
  .route("/api/research", research);

export type AppType = typeof app;
export { app };
