import { Hono } from "hono";
import { ClinicalHandoffReportResponseSchema } from "@moc/shared";
import { getOrCreateUser } from "../db/helpers.js";
import {
  generateAndPersistClinicalHandoffReport,
  getLatestClinicalHandoffReport,
  renderClinicalHandoffFhirBundle,
  renderClinicalHandoffPdf,
} from "../services/clinical-handoff-report-service.js";

const app = new Hono()
  .get("/latest", async (c) => {
    const user = await getOrCreateUser();
    const report =
      (await getLatestClinicalHandoffReport(user.id)) ??
      (await generateAndPersistClinicalHandoffReport(user.id, "manual"));

    return c.json(ClinicalHandoffReportResponseSchema.parse({ report }));
  })
  .post("/generate", async (c) => {
    const user = await getOrCreateUser();
    const report = await generateAndPersistClinicalHandoffReport(user.id, "manual");
    return c.json(ClinicalHandoffReportResponseSchema.parse({ report }));
  })
  .get("/latest.pdf", async (c) => {
    const user = await getOrCreateUser();
    const report =
      (await getLatestClinicalHandoffReport(user.id)) ??
      (await generateAndPersistClinicalHandoffReport(user.id, "manual"));
    const pdf = renderClinicalHandoffPdf(report);
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="clinical-handoff-${report.id}.pdf"`,
      },
    });
  })
  .get("/latest.fhir", async (c) => {
    const user = await getOrCreateUser();
    const report =
      (await getLatestClinicalHandoffReport(user.id)) ??
      (await generateAndPersistClinicalHandoffReport(user.id, "manual"));
    return c.json(renderClinicalHandoffFhirBundle(report));
  });

export type ReportsRoutes = typeof app;
export default app;
