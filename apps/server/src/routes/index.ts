import { Hono } from "hono";
import { cors } from "hono/cors";
import { research } from "../research/routes/research.js";
import assessments from "./assessments.js";
import emotions from "./emotions.js";
import health from "./health.js";
import home from "./home.js";
import journey from "./journey.js";
import moodLogs from "./mood-logs.js";
import observability from "./observability.js";
import sessions from "./sessions.js";
import settings from "./settings.js";
import userProfile from "./user-profile.js";
import voice from "./voice.js";

const app = new Hono()
  .use(
    "*",
    cors({
      origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
      ],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  )
  .route("/", health)
  .route("/api/home", home)
  .route("/api/sessions", sessions)
  .route("/api/assessments", assessments)
  .route("/api/emotions", emotions)
  .route("/api/journey", journey)
  .route("/api/mood-logs", moodLogs)
  .route("/api/user", userProfile)
  .route("/api", voice)
  .route("/api/settings", settings)
  .route("/api/observability", observability)
  // Research sandbox — route guard inside research.ts enforces RESEARCH_ENABLED=true
  .route("/api/research", research);

export type AppType = typeof app;
export { app };
