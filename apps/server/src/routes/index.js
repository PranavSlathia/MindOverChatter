import { Hono } from "hono";
import health from "./health.js";

const app = new Hono().route("/", health);
export { app };
//# sourceMappingURL=index.js.map
