"use strict";
/**
 * Programmatic migration generator for research tables.
 * Uses drizzle-kit/api to generate migration SQL without requiring a TTY.
 * Run: node -r tsx/cjs generate-research-migration.cjs
 */

async function main() {
  const { generateDrizzleJson, generateMigration } = require("drizzle-kit/api");
  const fs = require("node:fs");
  const path = require("node:path");

  // Load live schema
  const liveSchema = require("./src/db/schema/index.ts");
  // Load research schema
  const researchSchema = require("./src/research/db/schema/index.ts");

  const allImports = { ...liveSchema, ...researchSchema };

  // Read latest snapshot
  const prevSnapshotPath = path.join(__dirname, "drizzle/meta/0012_snapshot.json");
  const prevSnapshot = JSON.parse(fs.readFileSync(prevSnapshotPath, "utf-8"));

  console.log("Generating schema snapshot...");
  const currentSnapshot = generateDrizzleJson(allImports, prevSnapshot.id);

  console.log("Computing migration diff...");
  const sqlStatements = await generateMigration(prevSnapshot, currentSnapshot);

  if (sqlStatements.length === 0) {
    console.log("No schema changes detected.");
    return;
  }

  console.log(`Found ${sqlStatements.length} SQL statement(s).`);

  const migrationDir = path.join(__dirname, "drizzle");
  const migrationFile = path.join(migrationDir, "0013_research_tables.sql");
  const sqlContent = sqlStatements.join("\n--> statement-breakpoint\n") + "\n";
  fs.writeFileSync(migrationFile, sqlContent, "utf-8");
  console.log("Migration written:", migrationFile);

  const snapshotFile = path.join(migrationDir, "meta/0013_snapshot.json");
  fs.writeFileSync(snapshotFile, JSON.stringify(currentSnapshot, null, 2), "utf-8");
  console.log("Snapshot written:", snapshotFile);

  const journalFile = path.join(migrationDir, "meta/_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalFile, "utf-8"));
  journal.entries.push({
    idx: 13,
    version: "7",
    when: Date.now(),
    tag: "0013_research_tables",
    breakpoints: true,
  });
  fs.writeFileSync(journalFile, JSON.stringify(journal, null, 2), "utf-8");
  console.log("Journal updated.");
}

main().catch(e => { console.error(e); process.exit(1); });
