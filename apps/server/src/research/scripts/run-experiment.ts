#!/usr/bin/env tsx
// ── Research CLI Runner ──────────────────────────────────────────
// Entry point for running autoresearch experiments from the command line.
//
// Usage:
//   tsx apps/server/src/research/scripts/run-experiment.ts --experiment a --user <userId>
//   tsx apps/server/src/research/scripts/run-experiment.ts --experiment b --user <userId>
//   tsx apps/server/src/research/scripts/run-experiment.ts --experiment c --user <userId>
//   tsx apps/server/src/research/scripts/run-experiment.ts --experiment all --user <userId>
//   tsx apps/server/src/research/scripts/run-experiment.ts --promote --experiment a --run-id <uuid>
//
// Outputs JSON to stdout. Errors to stderr with non-zero exit code.
// Markdown reports are written to research/reports/ automatically.

import { runExperimentA } from "../experiments/experiment-a-calibration.js";
import { runExperimentB } from "../experiments/experiment-b-hypotheses.js";
import { runExperimentC } from "../experiments/experiment-c-direction.js";
import { promote } from "../lib/promote.js";
import {
  formatReportA,
  formatReportB,
  formatReportC,
} from "../lib/research-reporter.js";

// ── Argument parser ───────────────────────────────────────────────

interface ParsedArgs {
  experiment: "a" | "b" | "c" | "all" | null;
  userId: string | null;
  runId: string | null;
  isPromote: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    experiment: null,
    userId: null,
    runId: null,
    isPromote: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--promote") {
      args.isPromote = true;
    } else if (arg === "--experiment" || arg === "-e") {
      const next = argv[i + 1];
      if (next && ["a", "b", "c", "all"].includes(next)) {
        args.experiment = next as "a" | "b" | "c" | "all";
        i += 1;
      }
    } else if (arg === "--user" || arg === "-u") {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args.userId = next;
        i += 1;
      }
    } else if (arg === "--run-id") {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args.runId = next;
        i += 1;
      }
    }
  }

  return args;
}

// ── Usage ────────────────────────────────────────────────────────

function printUsage(): void {
  process.stdout.write(`
Research Experiment CLI Runner
================================

Run an experiment:
  tsx apps/server/src/research/scripts/run-experiment.ts --experiment a --user <userId>
  tsx apps/server/src/research/scripts/run-experiment.ts --experiment b --user <userId>
  tsx apps/server/src/research/scripts/run-experiment.ts --experiment c --user <userId>
  tsx apps/server/src/research/scripts/run-experiment.ts --experiment all --user <userId>

Promote a gate-approved proposal (Phase 3 — not yet implemented):
  tsx apps/server/src/research/scripts/run-experiment.ts --promote --experiment a --run-id <uuid>

Experiments:
  a  Outcome-Gated Calibration Evaluator
     Proposes a calibration rewrite gated against PHQ-9/GAD-7 trajectory.
  b  Hypothesis Confidence Feedback Simulator
     Simulates how session outcomes would shift therapy plan hypothesis confidence.
  c  therapeutic-direction.md Effectiveness Tracker
     Evaluates per-session compliance with therapy direction file.
  all  Run A, B, and C sequentially.

Output:
  JSON printed to stdout.
  Markdown reports written to apps/server/src/research/reports/
`);
}

// ── Fatal error helper ────────────────────────────────────────────

function fatal(message: string): never {
  process.stderr.write(`ERROR: ${message}\n`);
  process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Skip the first two elements (node/tsx and script path)
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  // ── Promote mode ──────────────────────────────────────────────
  if (args.isPromote) {
    if (!args.experiment || args.experiment === "all") {
      fatal("--promote requires --experiment a|b|c (not 'all')");
    }
    if (!args.runId) {
      fatal("--promote requires --run-id <uuid>");
    }

    let result: object;
    try {
      result = await promote(args.runId, args.experiment);
    } catch (err) {
      fatal(`promote() threw: ${err instanceof Error ? err.message : String(err)}`);
    }

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(0);
  }

  // ── Experiment mode ───────────────────────────────────────────
  if (!args.experiment) {
    printUsage();
    fatal("--experiment is required. Use: a, b, c, or all");
  }

  if (!args.userId) {
    fatal("--user <userId> is required");
  }

  const userId = args.userId;

  // ── Run selected experiment(s) ────────────────────────────────
  const results: object[] = [];

  const runA = async (): Promise<void> => {
    process.stderr.write("[research] Running Experiment A — Outcome-Gated Calibration...\n");
    let result;
    try {
      result = await runExperimentA(userId);
    } catch (err) {
      fatal(`Experiment A failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const { json } = formatReportA(result);
    results.push(json);
    process.stderr.write(`[research] Experiment A complete. Gate: ${result.gateDecision}\n`);
  };

  const runB = async (): Promise<void> => {
    process.stderr.write("[research] Running Experiment B — Hypothesis Simulator...\n");
    let result;
    try {
      result = await runExperimentB(userId);
    } catch (err) {
      fatal(`Experiment B failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const { json } = formatReportB(result);
    results.push(json);
    process.stderr.write(
      `[research] Experiment B complete. ${result.hypothesisDeltas.length} deltas, ` +
        `${result.highDriftCount} high-drift.\n`,
    );
  };

  const runC = async (): Promise<void> => {
    process.stderr.write("[research] Running Experiment C — Direction Compliance...\n");
    let result;
    try {
      result = await runExperimentC(userId);
    } catch (err) {
      fatal(`Experiment C failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const { json } = formatReportC(result);
    results.push(json);
    process.stderr.write(
      `[research] Experiment C complete. ${result.sessionsAnalyzed} sessions analyzed.\n`,
    );
  };

  switch (args.experiment) {
    case "a":
      await runA();
      break;
    case "b":
      await runB();
      break;
    case "c":
      await runC();
      break;
    case "all":
      await runA();
      await runB();
      await runC();
      break;
  }

  // Print all JSON results to stdout
  if (results.length === 1) {
    process.stdout.write(JSON.stringify(results[0], null, 2) + "\n");
  } else {
    process.stdout.write(JSON.stringify(results, null, 2) + "\n");
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `Unhandled error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
