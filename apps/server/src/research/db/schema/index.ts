// Research-only schema barrel.
// INVARIANT: This file must NEVER be imported by apps/server/src/db/schema/index.ts.
// These tables are isolated from the live schema to prevent accidental FK references
// from live tables into research tables.
export * from "./research-calibration-proposals";
export * from "./research-hypothesis-simulations";
export * from "./research-direction-compliance";
export * from "./research-replay-runs";
