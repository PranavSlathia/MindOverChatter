/**
 * Programmatic migration generator for research tables.
 * Used because drizzle-kit CLI requires a TTY and cannot run headlessly in CI/sandbox.
 * Run: tsx generate-research-migration.mts
 */
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Load all live schema tables
import * as liveSchema from "./src/db/schema/index.js";

// Load all research schema tables
import * as researchSchema from "./src/research/db/schema/index.js";

const allImports = { ...liveSchema, ...researchSchema };

// Read the latest snapshot as the previous state
const prevSnapshotPath = join(
  import.meta.dirname,
  "drizzle/meta/0012_snapshot.json",
);
const prevSnapshot = JSON.parse(readFileSync(prevSnapshotPath, "utf-8"));

console.log("Generating schema snapshot from current tables...");
const currentSnapshot = generateDrizzleJson(allImports, prevSnapshot.id);

console.log("Computing migration diff...");
const sqlStatements = await generateMigration(prevSnapshot, currentSnapshot);

if (sqlStatements.length === 0) {
  console.log("No schema changes detected — nothing to migrate.");
  process.exit(0);
}

console.log(`\nSQL statements to apply (${sqlStatements.length}):`);
sqlStatements.forEach((s, i) => console.log(`\n[${i + 1}]`, s));

// Write the migration file
const migrationDir = join(import.meta.dirname, "drizzle");
const migrationName = "0013_research_tables.sql";
const migrationPath = join(migrationDir, migrationName);

const sqlContent = sqlStatements.join("\n--> statement-breakpoint\n") + "\n";
writeFileSync(migrationPath, sqlContent, "utf-8");
console.log(`\nMigration written to: ${migrationPath}`);

// Update the snapshot
const snapshotPath = join(migrationDir, "meta/0013_snapshot.json");
writeFileSync(snapshotPath, JSON.stringify(currentSnapshot, null, 2), "utf-8");
console.log(`Snapshot written to: ${snapshotPath}`);

// Update the journal
const journalPath = join(migrationDir, "meta/_journal.json");
const journal = JSON.parse(readFileSync(journalPath, "utf-8"));
journal.entries.push({
  idx: 13,
  version: "7",
  when: Date.now(),
  tag: "0013_research_tables",
  breakpoints: true,
});
writeFileSync(journalPath, JSON.stringify(journal, null, 2), "utf-8");
console.log("Journal updated.");
