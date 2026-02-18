import type { Hono } from "hono";
import { hc } from "hono/client";

// TODO: Import AppType from @moc/server once server package exports are configured
// import type { AppType } from "@moc/server/routes/index";
type AppType = Hono;

const baseUrl = import.meta.env.VITE_API_URL || "";

export const api = hc<AppType>(baseUrl);
