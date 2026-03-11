declare const app: import("hono/hono-base").HonoBase<import("hono/types").BlankEnv, {
    "/health": {
        $get: {
            input: {};
            output: any;
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
}, "/", "/health">;
export default app;
//# sourceMappingURL=health.d.ts.map