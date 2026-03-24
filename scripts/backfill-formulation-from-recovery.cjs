#!/usr/bin/env node
/**
 * Backfill a richer formulation row from recovered therapeutic artifacts.
 *
 * Source of truth:
 * - recovered-therapeutic-data.json in the repo root
 * - current restored live user in Postgres
 *
 * This does NOT fabricate raw sessions/messages. It only upgrades the
 * user_formulations table from the sparse placeholder to a richer derived
 * formulation based on already recovered blocks, plan, and mined context.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RECOVERED_PATH = path.join(
  "/Users/pronav/Documents/Vibecode/Therapy",
  "recovered-therapeutic-data.json",
);

function psql(query) {
  return execSync(
    `docker exec therapy-db-1 psql -U moc -d moc -t -A -c "${query.replace(/"/g, '\\"')}"`,
    { encoding: "utf-8" },
  ).trim();
}

function buildRecoveredFormulation(recovered) {
  const presentingTheme =
    recovered.formulation?.presentingTheme_inferred ||
    "Identity destabilization and emotional numbness following layered relational losses and prolonged self-reliance.";

  const questions =
    recovered.formulation?.questionsWorthExploring_inferred || [];

  const domainSignals = {
    connection: {
      level: "high",
      trend: "stable",
      evidence:
        "Future vision includes things but no people; grandfather loss, relationship grief, and isolation remain central.",
    },
    self_regard: {
      level: "high",
      trend: "stable",
      evidence:
        "Self-worth has been anchored in relationships and achievement, while the 'not a good person' belief remains load-bearing.",
    },
    vitality: {
      level: "high",
      trend: "stable",
      evidence:
        "Irregular sleep and eating, activation difficulty, chronic health strain, and emotional numbness continue to affect energy.",
    },
    momentum: {
      level: "medium",
      trend: "stable",
      evidence:
        "He can still work and build, but time-panic and overwhelm often disrupt follow-through.",
    },
    meaning: {
      level: "medium",
      trend: "stable",
      evidence:
        "MindOverChatter, the wish to feel alive again, and the desire for a people-filled future still provide direction.",
    },
    groundedness: {
      level: "medium",
      trend: "stable",
      evidence:
        "Pressure, grief, and self-reliance loops make it hard to settle, but direct conversation and small steps can restore footing.",
    },
  };

  const actionRecommendations = [
    {
      id: "connection-grief-rebuild",
      priority: "high",
      domain: "connection",
      conversationHint:
        "Stay close to the missing-people theme in his future and explore what kind of connection still feels possible without rushing toward solutions.",
      evidenceSummary:
        "Relationship grief, grandfather loss, and a future vision without people recur across recovered blocks and the therapy plan.",
    },
    {
      id: "self-regard-inner-critic",
      priority: "high",
      domain: "self_regard",
      conversationHint:
        "When self-judgment surfaces, gently track what the 'not a good person' belief is trying to protect and how it shapes his days.",
      evidenceSummary:
        "The therapy plan and recovered memories both identify this belief as central and load-bearing.",
    },
    {
      id: "vitality-activation-energy",
      priority: "medium",
      domain: "vitality",
      conversationHint:
        "Keep interventions concrete around sleep, eating, and activation energy, using the small-step sequencing he already responds to.",
      evidenceSummary:
        "Late starts, not eating despite hunger, chronic health strain, and partial success with task decomposition appear repeatedly in recovered context.",
    },
  ];

  return {
    snapshot: {
      formulation: {
        presentingTheme,
        roots: [
          {
            content:
              "COVID disrupted college years and formative experiences, contributing to hollow grief and identity destabilization.",
            sourceType: "life_event",
            confidence: 0.82,
            evidenceRefs: [],
          },
          {
            content:
              "Grandfather's death removed the clearest source of unconditional love and feeling like enough.",
            sourceType: "life_event",
            confidence: 0.9,
            evidenceRefs: [],
          },
          {
            content:
              "The seven-year relationship anchored safety and self-worth; its ending collapsed an imagined future.",
            sourceType: "life_event",
            confidence: 0.9,
            evidenceRefs: [],
          },
          {
            content:
              "Early self-sufficiency and the belief that no one would save him shaped a strong but lonely self-reliance style.",
            sourceType: "profile_fact",
            confidence: 0.84,
            evidenceRefs: [],
          },
        ],
        recentActivators: [
          {
            content:
              "Waking late often triggers time-panic, overwhelm, and rapid self-judgment about the day.",
            confidence: 0.88,
            evidenceRefs: [],
          },
          {
            content:
              "Weekend nights and extended aloneness intensify emptiness, grief, and the absence of people in his future.",
            confidence: 0.84,
            evidenceRefs: [],
          },
          {
            content:
              "The December 25 closure continues to reactivate grief, numbness, and questions of who he is without the relationship.",
            confidence: 0.86,
            evidenceRefs: [],
          },
        ],
        perpetuatingCycles: [
          {
            pattern:
              "A delayed start becomes an all-day referendum on his worth.",
            mechanism:
              "Time-panic leads to overwhelm, freeze, avoidance, and harsher self-condemnation, which then makes re-entry harder.",
            evidenceRefs: [],
          },
          {
            pattern:
              "Work, coding, and cannabis relieve pain in the short term but can defer emotional processing and body needs.",
            mechanism:
              "Functioning becomes both refuge and trap, preserving agency while narrowing space for grief, rest, and connection.",
            evidenceRefs: [],
          },
          {
            pattern:
              "Rapid reframing and forward motion help him cope but can bypass deeper feeling.",
            mechanism:
              "Adaptive resilience keeps him moving, yet it can also protect him from sitting with grief, loneliness, and self-worth injury.",
            evidenceRefs: [],
          },
        ],
        protectiveStrengths: [
          {
            content:
              "He is highly reflective and often feels genuine relief when he can think out loud with someone who understands.",
            sourceType: "win",
            evidenceRefs: [],
          },
          {
            content:
              "MindOverChatter and his building work provide structure, agency, and a live thread of meaning.",
            sourceType: "goal",
            evidenceRefs: [],
          },
          {
            content:
              "He can respond to small-step sequencing when overwhelm is named concretely and gently.",
            sourceType: "goal",
            evidenceRefs: [],
          },
          {
            content:
              "His longing to feel alive again and to have people in his future shows that hope and attachment needs are still intact.",
            sourceType: "goal",
            evidenceRefs: [],
          },
        ],
      },
      userReflection: {
        summary:
          "A lot of what weighs on you seems to live at the intersection of grief, self-worth, and carrying too much alone for too long. There is a strong part of you that keeps moving and building, but it has often had to do that without enough softness, support, or room to feel what was lost.",
        encouragement:
          "You have already done something important by naming these patterns so clearly. The fact that relief shows up when you can think out loud tells us connection and understanding still reach you, even when things feel numb.",
      },
      activeStates: [
        {
          label: "emotional numbness",
          confidence: 0.9,
          signal:
            "Recovered blocks repeatedly describe emptiness, hollowness, and feeling less alive since layered losses.",
          domain: "vitality",
          evidenceRefs: [],
        },
        {
          label: "compounded grief",
          confidence: 0.92,
          signal:
            "Grandfather loss, relationship closure, friends lost to addiction, and COVID disruption all remain active threads.",
          domain: "connection",
          evidenceRefs: [],
        },
        {
          label: "identity destabilization",
          confidence: 0.88,
          signal:
            "Recovered material consistently frames the current period as losing a version of self and future, not just isolated events.",
          domain: "meaning",
          evidenceRefs: [],
        },
        {
          label: "self-worth erosion",
          confidence: 0.86,
          signal:
            "The 'not a good person' belief and reliance on external validation show up across recovered blocks and the therapy plan.",
          domain: "self_regard",
          evidenceRefs: [],
        },
        {
          label: "functional isolation",
          confidence: 0.84,
          signal:
            "He keeps functioning and building, but often carries pressure, grief, and body strain alone.",
          domain: "connection",
          evidenceRefs: [],
        },
      ],
      domainSignals,
      questionsWorthExploring: questions.slice(0, 6).map((question) => ({
        question,
        rationale:
          "Recovered research and therapy-plan artifacts repeatedly identify this as clinically central and still under-explored.",
        linkedTo: "recovered_context",
      })),
      themeOfToday:
        "Rebuilding a steadier sense of self after layered loss, while loosening the grip of self-reliance and self-judgment.",
      copingSteps: [
        {
          step: "Shrink the first step",
          rationale:
            "You already respond better when the day gets broken into freshen up, eat, then work. Keeping the first move tiny helps interrupt the all-or-nothing spiral.",
          domain: "momentum",
        },
        {
          step: "Stay with the living ache",
          rationale:
            "The future-without-people feeling carries a lot of weight. Giving that ache words, instead of outrunning it with analysis, may be part of what helps connection feel possible again.",
          domain: "connection",
        },
        {
          step: "Borrow warmth, not pressure",
          rationale:
            "Your inner critic moves fast when days slip. It could help to answer it with something more specific and fair than 'I failed' when the old story shows up.",
          domain: "self_regard",
        },
      ],
      dataConfidence: "emerging",
      moodTrend: {
        direction: "stable",
        period: "not enough data",
      },
    },
    domainSignals,
    actionRecommendations,
    dataConfidence: "emerging",
  };
}

function main() {
  if (!fs.existsSync(RECOVERED_PATH)) {
    throw new Error(`Recovered data file not found at ${RECOVERED_PATH}`);
  }

  const recovered = JSON.parse(fs.readFileSync(RECOVERED_PATH, "utf8"));
  const userId = psql("SELECT id FROM user_profiles ORDER BY created_at DESC LIMIT 1");
  if (!userId) {
    throw new Error("No user found in user_profiles");
  }

  const latest = psql(
    `SELECT COALESCE(MAX(version), 0) FROM user_formulations WHERE user_id = '${userId}'`,
  );
  const nextVersion = Number.parseInt(latest || "0", 10) + 1;

  const { snapshot, domainSignals, actionRecommendations, dataConfidence } =
    buildRecoveredFormulation(recovered);

  const snapshotJson = JSON.stringify(snapshot).replace(/'/g, "''");
  const domainSignalsJson = JSON.stringify(domainSignals).replace(/'/g, "''");
  const actionRecommendationsJson = JSON.stringify(actionRecommendations).replace(
    /'/g,
    "''",
  );

  psql(`
    INSERT INTO user_formulations
      (user_id, version, snapshot, domain_signals, action_recommendations, data_confidence, triggered_by)
    VALUES
      ('${userId}', ${nextVersion}, '${snapshotJson}', '${domainSignalsJson}', '${actionRecommendationsJson}', '${dataConfidence}', 'manual')
  `);

  const row = psql(
    `SELECT version || E'\\t' || data_confidence || E'\\t' || triggered_by FROM user_formulations WHERE user_id='${userId}' ORDER BY version DESC LIMIT 1`,
  );

  console.log(`Inserted recovered formulation v${nextVersion} for user ${userId}`);
  console.log(`Latest formulation row: ${row}`);
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
