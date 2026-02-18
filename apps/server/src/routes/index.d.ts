declare const app: import("hono/hono-base").HonoBase<
  import("hono/types").BlankEnv,
  | import("hono/types").BlankSchema
  | import("hono/types").MergeSchemaPath<
      {
        "/health": {
          $get: {
            input: {};
            output: any;
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
          };
        };
      },
      "/"
    >,
  "/",
  "/"
>;
export type AppType = typeof app;
export { app };
//# sourceMappingURL=index.d.ts.map
