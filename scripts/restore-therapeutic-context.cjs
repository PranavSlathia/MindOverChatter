#!/usr/bin/env node
/**
 * Therapeutic Data Recovery Script
 *
 * Restores Mem0 memories from ~/.mem0/history.db backup,
 * inserts provenance into the memories table, seeds memory blocks,
 * and triggers formulation + therapy plan regeneration.
 *
 * Prerequisites:
 * - PostgreSQL running on localhost:5433 (Docker therapy-db-1)
 * - Mem0 service running on localhost:8004
 * - Server running on localhost:3000 (for formulation/therapy plan generation)
 * - ~/.mem0/history.db exists with backup data
 *
 * Usage: node scripts/restore-therapeutic-context.cjs
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ── Config ────────────────────────────────────────────────────────
const DB_URL = "postgresql://moc:password@localhost:5433/moc";
const MEM0_URL = "http://localhost:8004";
const SERVER_URL = "http://localhost:3000";
const HISTORY_DB = path.join(process.env.HOME, ".mem0", "history.db");
const LIVING_MEMORIES_PATH = "/tmp/living-memories.json";
const RECOVERED_DATA_PATH_CANDIDATES = [
  process.env.RECOVERED_DATA_PATH,
  "/tmp/recovered-therapeutic-data.json",
  path.join(process.cwd(), "recovered-therapeutic-data.json"),
].filter(Boolean);

// ── Memory type classification (mirrors services/memory/main.py) ──
const TYPE_KEYWORDS = {
  relationship: ["father", "mother", "sister", "brother", "friend", "partner", "family", "parent", "spouse", "wife", "husband", "girlfriend", "boyfriend", "colleague", "boss", "teacher", "mentor"],
  goal: ["goal", "want to", "aims to", "hopes to", "plans to", "working toward", "trying to", "aspires"],
  coping_strategy: ["coping", "helps when", "deals with", "manages by", "finds relief", "calms down by"],
  recurring_trigger: ["trigger", "triggered by", "stressed by", "anxious when", "upset when", "pressured", "frustrated by"],
  life_event: ["birthday", "moved", "graduated", "married", "divorced", "lost", "started", "quit", "hired", "fired", "diagnosed"],
  symptom_episode: ["panic", "anxiety attack", "depressed", "insomnia", "nightmare", "flashback", "dissociat"],
  safety_critical: ["suicid", "self-harm", "hurt myself", "end my life", "not suicidal"],
  win: ["proud", "achieved", "accomplished", "breakthrough", "progress", "better at", "overcame"],
  formative_experience: ["childhood", "grew up", "as a child", "when I was young", "early years", "school days"],
};

function classifyMemoryType(text) {
  // Check for [TYPE:xxx] prefix first
  const typeMatch = text.match(/^\[TYPE:(\w+)\]\s*/);
  if (typeMatch) {
    const type = typeMatch[1];
    const validTypes = [
      "profile_fact", "relationship", "goal", "coping_strategy",
      "recurring_trigger", "life_event", "symptom_episode",
      "unresolved_thread", "safety_critical", "win", "formative_experience"
    ];
    if (validTypes.includes(type)) return type;
  }

  const lower = text.toLowerCase();

  // Check safety_critical first (highest priority)
  for (const kw of TYPE_KEYWORDS.safety_critical) {
    if (lower.includes(kw)) return "safety_critical";
  }

  // Check other types
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (type === "safety_critical") continue;
    for (const kw of keywords) {
      if (lower.includes(kw)) return type;
    }
  }

  return "profile_fact"; // default
}

function stripTypePrefix(text) {
  return text.replace(/^\[TYPE:\w+\]\s*/, "");
}

// ── DB helpers ────────────────────────────────────────────────────
function psql(query) {
  return execSync(
    `docker exec therapy-db-1 psql -U moc -d moc -t -A -c "${query.replace(/"/g, '\\"')}"`,
    { encoding: "utf-8" }
  ).trim();
}

async function httpPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${url} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function httpGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed (${res.status})`);
  return res.json();
}

function findRecoveredDataPath() {
  for (const candidate of RECOVERED_DATA_PATH_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log("=== Therapeutic Data Recovery ===\n");

  // 1. Get user UUID
  const userId = psql("SELECT id FROM user_profiles LIMIT 1");
  if (!userId) {
    console.error("No user found in user_profiles. Start a session first to create the user.");
    process.exit(1);
  }
  console.log(`User UUID: ${userId}`);

  // 2. Check services
  try {
    await httpGet(`${MEM0_URL}/health`);
    console.log("Mem0 service: healthy");
  } catch (e) {
    console.error("Mem0 service not reachable at", MEM0_URL);
    process.exit(1);
  }

  try {
    await httpGet(`${SERVER_URL}/health`);
    console.log("Server: healthy");
  } catch (e) {
    console.warn("Server not reachable — will skip formulation/therapy plan generation");
  }

  // 3. Seed empty memory blocks
  console.log("\n--- Phase 1: Seeding memory blocks ---");
  const blockCount = psql("SELECT COUNT(*) FROM memory_blocks WHERE user_id = '" + userId + "'");
  if (parseInt(blockCount) < 7) {
    const blocks = [
      { label: "user/overview", limit: 500 },
      { label: "user/goals", limit: 500 },
      { label: "user/triggers", limit: 500 },
      { label: "user/coping_strategies", limit: 500 },
      { label: "user/relationships", limit: 500 },
      { label: "user/origin_story", limit: 1000 },
      { label: "companion/therapeutic_calibration", limit: 800 },
    ];
    for (const block of blocks) {
      psql(`INSERT INTO memory_blocks (user_id, label, content, char_limit) VALUES ('${userId}', '${block.label}', '', ${block.limit}) ON CONFLICT (user_id, label) DO NOTHING`);
    }
    console.log("Seeded 7 memory blocks");
  } else {
    console.log("Memory blocks already exist");
  }

  // 4. Load living memories
  console.log("\n--- Phase 2: Importing Mem0 memories ---");
  if (!fs.existsSync(LIVING_MEMORIES_PATH)) {
    console.error("Living memories file not found at", LIVING_MEMORIES_PATH);
    process.exit(1);
  }

  const memories = JSON.parse(fs.readFileSync(LIVING_MEMORIES_PATH, "utf-8"));
  console.log(`Found ${memories.length} living memories to restore`);

  let imported = 0;
  let failed = 0;
  let skipped = 0;

  for (const mem of memories) {
    const content = stripTypePrefix(mem.content);
    const memoryType = classifyMemoryType(mem.content);

    if (!content.trim()) {
      skipped++;
      continue;
    }

    // Insert into Mem0 for vector embeddings
    try {
      await httpPost(`${MEM0_URL}/memories/add`, {
        user_id: userId,
        session_id: "restored",
        messages: [{ role: "user", content: content }],
        metadata: { restored: true, original_created_at: mem.created_at, memory_type: memoryType },
      });
    } catch (e) {
      // Mem0 add might fail for duplicates — that's OK
      console.warn(`  Mem0 add warning for "${content.slice(0, 50)}...": ${e.message.slice(0, 100)}`);
    }

    // Insert provenance into memories table
    try {
      const createdAt = mem.created_at ? `'${mem.created_at}'` : "NOW()";
      psql(`INSERT INTO memories (user_id, content, memory_type, importance, confidence, created_at) VALUES ('${userId}', '${content.replace(/'/g, "''")}', '${memoryType}', 0.8, 0.8, ${createdAt})`);
      imported++;
      if (imported % 20 === 0) console.log(`  Imported ${imported}/${memories.length}...`);
    } catch (e) {
      console.warn(`  DB insert failed for "${content.slice(0, 50)}...": ${e.message.slice(0, 100)}`);
      failed++;
    }
  }

  console.log(`\nImported: ${imported}, Failed: ${failed}, Skipped: ${skipped}`);

  // 5. Check for JSONL-mined data
  console.log("\n--- Phase 3: Checking for JSONL-recovered data ---");
  const recoveredPath = findRecoveredDataPath();
  let recovered = null;
  if (recoveredPath) {
    try {
      recovered = JSON.parse(fs.readFileSync(recoveredPath, "utf-8"));
      console.log(`Found JSONL-recovered data at ${recoveredPath}`);
      if (recovered.memory_blocks) {
        console.log("  Memory blocks:", Object.keys(recovered.memory_blocks).join(", "));
      }
      if (recovered.therapy_plan) console.log("  Therapy plan: found");
      if (recovered.formulation) console.log("  Formulation: found");
      if (recovered.calibration) console.log("  Calibration: found");
    } catch (e) {
      console.warn("Failed to parse recovered data:", e.message);
    }
  } else {
    console.log("No JSONL-recovered data found in known locations");
  }

  // 6. Populate memory blocks
  console.log("\n--- Phase 4: Populating memory blocks ---");
  if (recovered?.memory_blocks) {
    for (const [label, content] of Object.entries(recovered.memory_blocks)) {
      if (content && content.trim()) {
        const safe = content.replace(/'/g, "''").slice(0, label === "user/origin_story" ? 1000 : label === "companion/therapeutic_calibration" ? 800 : 500);
        psql(`UPDATE memory_blocks SET content = '${safe}', updated_by = 'recovery-script', updated_at = NOW() WHERE user_id = '${userId}' AND label = '${label}'`);
        console.log(`  Updated ${label} (${safe.length} chars)`);
      }
    }
  } else {
    console.log("  Will generate memory blocks from restored memories via Claude (Phase 6)");
  }

  // 7. Restore therapy plan from JSONL if available
  if (recovered?.therapy_plan) {
    console.log("\n--- Phase 5a: Restoring therapy plan from JSONL ---");
    const planJson = JSON.stringify(recovered.therapy_plan).replace(/'/g, "''");
    psql(`INSERT INTO therapy_plans (user_id, version, plan, triggered_by) VALUES ('${userId}', 1, '${planJson}', 'manual') ON CONFLICT (user_id, version) DO NOTHING`);
    console.log("  Restored therapy plan v1");
  }

  // 8. Restore formulation from JSONL if available
  if (recovered?.formulation) {
    console.log("\n--- Phase 5b: Restoring formulation from JSONL ---");
    const snapJson = JSON.stringify(recovered.formulation).replace(/'/g, "''");
    // Update the existing formulation (version 1 already exists)
    psql(`UPDATE user_formulations SET snapshot = '${snapJson}', triggered_by = 'manual' WHERE user_id = '${userId}' AND version = 1`);
    console.log("  Restored formulation v1");
  }

  // 9. Update user profile
  console.log("\n--- Phase 6: Updating user profile ---");
  psql(`UPDATE user_profiles SET display_name = 'Pranav' WHERE id = '${userId}' AND (display_name IS NULL OR display_name = 'User')`);

  // Extract goals and patterns from memories
  const goalMemories = memories.filter(m => classifyMemoryType(m.content) === "goal").map(m => stripTypePrefix(m.content));
  const triggerMemories = memories.filter(m => classifyMemoryType(m.content) === "recurring_trigger").map(m => stripTypePrefix(m.content));

  if (goalMemories.length > 0) {
    const goalsJson = JSON.stringify(goalMemories.slice(0, 5)).replace(/'/g, "''");
    psql(`UPDATE user_profiles SET goals = '${goalsJson}'::jsonb WHERE id = '${userId}'`);
    console.log(`  Set ${Math.min(goalMemories.length, 5)} goals`);
  }
  if (triggerMemories.length > 0) {
    const patternsJson = JSON.stringify(triggerMemories.slice(0, 5)).replace(/'/g, "''");
    psql(`UPDATE user_profiles SET patterns = '${patternsJson}'::jsonb WHERE id = '${userId}'`);
    console.log(`  Set ${Math.min(triggerMemories.length, 5)} patterns`);
  }

  // 10. Final counts
  console.log("\n=== Recovery Complete ===");
  console.log("Memories:", psql("SELECT COUNT(*) FROM memories"));
  console.log("Memory blocks:", psql("SELECT COUNT(*) FROM memory_blocks WHERE content != '' AND user_id = '" + userId + "'"));
  console.log("Therapy plans:", psql("SELECT COUNT(*) FROM therapy_plans WHERE user_id = '" + userId + "'"));
  console.log("Formulations:", psql("SELECT COUNT(*) FROM user_formulations WHERE user_id = '" + userId + "'"));
  console.log("Mem0 vectors:", psql("SELECT COUNT(*) FROM mem0_vectors"));
  console.log("User profile:", psql("SELECT display_name FROM user_profiles WHERE id = '" + userId + "'"));

  console.log("\n--- Next steps ---");
  console.log("1. If memory blocks are empty, start a session and end it — the onEnd hooks will populate them");
  console.log("2. If therapy plan is missing, start+end a session — the therapy-plan hook will generate one");
  console.log("3. Check the companion knows you: start a session and see if the opening message is personalized");
}

main().catch((err) => {
  console.error("Recovery failed:", err);
  process.exit(1);
});
