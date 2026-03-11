# MindOverChatter — Vision Research: Differentiating Features

> Deep research synthesis across 12+ threads, with safety review applied. Features are classified by readiness and risk.

## The Core Gap

Every existing product (Woebot, Wysa, Replika, Ash, Noah) shares the same fundamental limitation: **they are chatbots that wait for you to talk.** None of them actually *understand* what's happening in your body, your behavior patterns, or your life trajectory. They react to text. That's it.

MindOverChatter already has pieces no one else has (multimodal emotion + structured memory + open-ended therapeutic blending). The features below would make it genuinely world-changing — but only if built with the right safety constraints.

---

## Feature Safety Framework

Every feature in this product touches mental health. Before any feature ships, it must answer:

| Question | Required Answer |
|---|---|
| What data does it use? | Explicit list of inputs |
| What claim is it allowed to make? | Bounded, never diagnostic |
| What consent does it require? | Opt-in model defined |
| What success metric proves value? | Measurable outcome |
| What false-positive threshold shuts it off? | Kill switch criteria |
| When must it never activate? | Contraindications listed |
| Can the user pause/disable it? | Always yes |
| Does every inference show provenance? | Source, confidence, editability |

Features that cannot answer all of these do not ship.

### Release Scorecards

Each "Build Now" feature has a one-line ship/no-ship gate below. These are evaluated before the feature enters user testing.

| Feature | Ship If | No-Ship If |
|---|---|---|
| Somatic regulation | All exercises have abort conditions; no body-state claims in output | Any exercise lacks stop condition or makes nervous system claims |
| Digital phenotyping lite | Opt-in consent flow tested; outreach limited to 1x per pattern; kill switch functional | Outreach fires without consent; false-positive rate >30% in internal testing |
| Behavioral activation lite | Follow-ups reference specific memories with provenance; no unsolicited push | Follow-ups feel generic or nag; any out-of-session nudges exist |
| Journey timeline | Every entry has source link; user can edit/delete; no freeform narrative synthesis | Any entry lacks provenance; editability broken; AI generates unsourced life summaries |
| Structured formulation | Full formulation objects stay internal; user sees only tentative pattern language | Any raw formulation, score, or hypothesis is surfaced to the user |
| Auditable inferences | Important inferences cite source session; user can flag "that's wrong" | Inferences appear without provenance; no correction mechanism |
| Indic language pipeline | IndicLID + IndicXlit accuracy >90% on Hinglish test corpus | Misidentification rate causes wrong-language responses |

---

# Build Now — Safe, High-Impact Features

## 1. Somatic & Nervous System Regulation Layer (The Body Track)

**The gap**: Therapy is shifting from cognitive-only (CBT) to body-based approaches. Polyvagal Theory shows that nervous system state determines whether someone can even *think* clearly. No existing AI companion addresses the body.

**What to build**:
- Guided breathing exercises with real-time visual animations (box breathing, 4-7-8, polyvagal-informed patterns)
- Progressive muscle relaxation and body scan flows — AI guides you through them by voice
- Grounding exercises (5-4-3-2-1 senses technique) delivered conversationally
- Track which somatic exercises actually work for this user over time

**Safety constraints**:
- Always **self-initiated** — the user chooses to start an exercise, the AI can suggest but never auto-launch
- **Low-claim** — "this exercise helps some people feel calmer" not "this will fix your anxiety"
- No claims about nervous system state — the AI does not tell the user what their body is doing

**Contraindications — do not offer when**:
- User is in active crisis (crisis pipeline takes priority, not breathing exercises)
- User reports chest pain, breathing difficulty, or physical distress (direct to medical help)
- User has flagged that breathing exercises increase their anxiety (some people experience this — respect it)
- During dissociative episodes — grounding exercises (5-4-3-2-1 senses) are safer than deep breathing in this state

**Abort conditions — stop immediately if**:
- User says "stop," "this isn't helping," or "I feel worse" — acknowledge and offer alternatives
- User reports dizziness, lightheadedness, or panic during a breathing exercise
- Fallback: always offer a simple grounding alternative ("Can you name 5 things you can see right now?") if a somatic exercise is stopped

**Open source tools**:
- [Box Breathing visual animation](https://lassebomh.github.io/box-breathing/) (open source, GitHub)
- Kokoro TTS (already in our stack) for voice-guided exercises

**Why it matters**: When someone is in a panic attack, CBT thought records are useless. They need their nervous system regulated first. A companion that offers *"would you like to try a breathing exercise?"* is practical, safe, and a genuine differentiator.

---

## 2. Digital Phenotyping Lite — App Telemetry Only

**The gap**: Every mental health app asks "how are you feeling?" But depression's cruelest feature is that people stop engaging with apps. The people who need help most are the ones who go silent.

**What to build (v1 — app telemetry only)**:
- Track **only your own app's data**: session frequency, time-of-day patterns, message length trends, session gaps
- No phone sensors, no mindLAMP, no AWARE framework — those are v3+ if ever
- Pattern detection is internal-only; surface observations only with explicit opt-in

**Safety constraints — REQUIRED**:
- **Explicit opt-in**: User must actively enable "usage insights" with clear explanation of what's tracked
- **Outreach policy**: The app may note patterns *once* per observation ("I noticed you haven't been by in a while"). It does not nag, escalate, or repeatedly flag disengagement
- **Silence is not a diagnosis**: A user who stops using the app may be doing well, may be busy, may have found a therapist. The app must never interpret disengagement as deterioration without explicit user confirmation
- **Failure boundary**: If the user disables insights or says "stop noticing," the feature stays off permanently until re-enabled
- **Kill switch**: If false-positive outreach rate exceeds 30% in internal testing, auto-disable

**Open source tools**:
- No external tools needed for v1 — just query your own session/message tables
- [mindLAMP](https://docs.lamp.digital/), [AWARE Framework](https://awareframework.com/) — reference only, not for initial build

**Why it matters**: The difference between an app that waits for users to show up, and one that *gently notices when they disappear* — but only with permission and only once.

---

## 3. Behavioral Activation Lite — In-Session Planning

**The gap**: AI companions are reactive — they talk *about* problems. But evidence shows that for depression, *doing things* (behavioral activation) is as effective as CBT and easier to implement digitally. A 2025 RCT confirmed BA-based mobile apps significantly reduce depression.

**What to build (v1 — no JITAI)**:
- **In-session** micro-activity planning: AI suggests activities based on the user's goals, energy level, and time of day
- Simple follow-ups: "Last time you mentioned walks help. Have you been able to do any this week?"
- Activity tracking via conversation: user tells the AI what they did, AI remembers via memory system
- Memory of what helped: "You said the evening walk on Tuesday helped you sleep. Want to plan another?"

**What NOT to build yet**:
- ~~JITAI (Just-in-Time Adaptive Interventions)~~: requires notification policy, suppression rules, experimentation logic, outcome measurement. This is a product in itself — do not put in initial scope
- ~~Push notifications or nudges outside the app~~
- ~~Avoidance detection~~ without extensive testing of false-positive rates

**Open source tools**:
- [Therapist Aid worksheets](https://www.therapistaid.com/worksheets/progressive-muscle-relaxation-script) — free CBT/BA worksheets and scripts (Creative Commons)
- The innovation is integrating BA with the AI's longitudinal memory of what works for *this person*

**Why it matters**: Most people with depression know what they *should* do. They can't *start*. An AI that gently plans, remembers, and celebrates — using memory of what actually worked before — is one of the strongest practical differentiators in this document.

---

## 4. Evidence-Backed Journey Timeline

**The gap**: Current apps have chat history. Nobody has a *life story*. Our memory architecture (10 typed memory categories, journey timeline) is 80% of the way there. The missing piece is presenting it back to the user as a narrative.

**What to build (phased)**:
- **Phase 1 — Structured events**: Visual timeline showing discrete entries: life events, symptom episodes, wins, turning points, goals. Each is a card with source session link, date, and user-confirmed status. No prose. No synthesis
- **Phase 2 — Trend overlays**: Layer quantitative trends (mood scores, session frequency, assessment scores) onto the timeline. Still data, not narrative
- **Phase 3 — Tentative narrative** (only after memory quality is proven): AI-generated summary paragraphs ("Over the last 3 months, based on your sessions, you've mentioned work stress and improved sleep after starting walks"). Always framed as "from your sessions" and always editable

**What NOT to build initially**:
- ~~Freeform life narrative as the primary UX~~: Structured events and trends come first. Narrative synthesis is a later layer
- ~~AI-authored autobiography~~: The timeline is a structured view of *what the user said*, not what the AI concludes about their life

**Safety constraints — REQUIRED**:
- **Every entry needs provenance**: "From session on March 5th" with link to source
- **Editability is mandatory**: User can correct or delete any entry; corrections persist
- **Re-authoring with consent**: Surfacing counter-examples to problem stories must be framed as questions — "I see you handled the March deadline well — does that fit with how you see things?" — never assertions
- **User-confirmed notes**: User can add their own annotations to the timeline; these take priority over AI-extracted entries

**Open source tools**:
- Our existing memory system (session_summaries, typed memories, journey timeline queries) is the foundation
- [Recharts](https://recharts.org/) (already in our stack) for timeline visualization

**Why it matters**: The most powerful moment in therapy is when someone sees their life from a different angle. But a *wrong* narrative from an AI can feel authoritative and stick. Starting with structured events and earning the right to synthesize narrative — only once memory quality is proven — makes this safe and transformative.

---

## 5. Memory Architecture — v1: Mem0, v2: Temporal Graph + Editable Memory

**The gap**: Flat fact extraction isn't enough. The moat is knowing what changed, when, and what evidence supports it.

**v1 — Mem0 (Build Now)**:
- Fast fact extraction from conversation turns with typed memories and provenance
- Cheap, proven, handles dedup
- Already planned — see MEM0_INTEGRATION_PLAN.md

**v2 — Graphiti temporal graph sidecar (Deferred)**:
- Tracks *state changes* over time: "User had insomnia → started evening walks → insomnia resolved" becomes a graph with timestamped edges, not three disconnected facts
- Don't replace Postgres/pgvector — extend it as a sidecar
- [Graphiti](https://github.com/getzep/graphiti) — temporal knowledge graph for AI agents, by Zep

**v2+ — Letta user-editable memory (Deferred)**:
- Users can see what the AI "knows," confirm facts, correct mistakes, delete memories
- Requires extraction quality to be proven first — surfacing bad memories destroys trust
- [Letta](https://github.com/letta-ai/letta) (formerly MemGPT) — stateful AI agents with editable, inspectable memory

**Why it matters**: The app should be able to say "sleep dropped for 9 days, anxiety spikes before family calls, activity fell after job loss" — connecting temporal events into a causal narrative. v1 gets us provenance-backed facts; v2 gets us the graph.

---

## 6. Structured Clinical Formulation — What's Happening, Not What's Wrong

**The gap**: AI companions either avoid clinical reasoning entirely (chatbot mode) or jump to labels ("you might have anxiety"). Neither is useful. Structured formulation tracks *what is actually happening* without diagnosing.

**What to build**:
- Replace "what is wrong with the user?" with structured observation tracking across: symptoms, triggers, routines, relationships, goals, coping strategies, episodes, assessment scores, crisis plans
- Each observation links back to the session and message where it was captured
- Longitudinal pattern detection: "anxiety scores elevated 3 of last 4 sessions, correlating with upcoming family events"

**Internal vs user-visible boundary — CRITICAL**:
- **Full formulation objects are internal-only**: structured hypotheses, confidence scores, evidence arrays, and severity assessments are never shown to the user. They inform the AI's reasoning
- **Users see only tentative, evidence-backed pattern language**: "I've noticed your sleep has been shorter the last few sessions — does that match how you're feeling?" — not "your sleep score dropped 40% which correlates with elevated anxiety indicators"
- The app says: *"sleep dropped for 9 days, anxiety spikes before family calls, activity fell after job loss"* — NOT *"you have X"*
- This boundary prevents drift back toward quasi-diagnosis. If a formulation object is ever surfaced raw, that is a bug

**Why it matters**: This is what good therapists actually do — they track patterns across sessions. They don't diagnose on day one. They say "I'm noticing a pattern" and check it with the client. An AI that builds a structured, evidence-based picture over time is more honest and more useful than one that labels.

---

## 7. Explainable & Auditable Inferences

**The gap**: Current AI companions are black boxes — they say things but can't explain *why*. If the AI says "you seem more anxious this week," the user has no way to know what data informed that. And they can't correct it if it's wrong.

**What to build (phased)**:
- **Phase 3-4 — Provenance + correction hooks**: Every important inference carries source (session + message) and confidence score. User can flag "that's not right" on any AI statement that references their history, and the correction is stored. Contradiction detection: when new info conflicts with stored memories, flag rather than silently overwrite
- **Phase 5-6 — Memory browser** (only after extraction quality is stable): Full inspect/edit/delete UI for stored memories. Requires confidence that the memory system isn't producing garbage that would erode trust if surfaced. Validity windows (how long before re-confirmation needed) added here
- Every therapeutic response can explain which past events, patterns, and assessment scores informed it — "therapeutic memory with proof"

**Why it matters**: Trust is everything in therapeutic relationships. An AI that says "I think you're stressed because your sleep dropped and you mentioned the deadline three times" is more trustworthy than one that just says "you seem stressed." But showing users a memory browser full of wrong extractions would *destroy* trust — so provenance first, full browser after quality is proven.

---

## 8. Indic Language Intelligence Stack

**The gap**: Our users speak Hinglish — code-switched Hindi-English with romanized Hindi. Standard NLP tools fail catastrophically on this. Most "multilingual" models treat Hindi and English as separate languages and can't handle the fluid switching.

**Open source tools**:
- [IndicLID](https://github.com/AI4Bharat/IndicLID) — language identification for romanized Indic languages. Detects which parts of a message are Hindi, English, or code-switched
- [IndicXlit](https://github.com/AI4Bharat/IndicXlit) — transliteration between romanized and native scripts. "mujhe accha nahi lag raha" → "मुझे अच्छा नहीं लग रहा"
- [IndicTrans2](https://github.com/AI4Bharat/IndicTrans2) — state-of-the-art translation for 22 Indic languages. Can handle code-mixed input
- [L3Cube code-mixed-nlp](https://github.com/l3cube-pune/code-mixed-nlp) — sentiment analysis, NER, and POS tagging specifically trained on Hinglish data

**Why it matters**: If the user says "mujhe bahut anxiety ho rahi hai office mein," the system needs to understand this is a clinical concern in Hinglish, not garbled English. These tools give us native-level understanding of how our users actually speak.

---

# Deferred — Requires Heavy Constraints Before Building

> These features have genuine potential but carry safety, scope, or accuracy risks that must be resolved before implementation. They are NOT in initial scope.

## 9. Emotion-LLaMA — Internal-Only Multimodal Fusion (v3+)

**The research**: Emotion-LLaMA (NeurIPS 2024) is a unified model that processes audio, visual, and text together through emotion-specific encoders, achieving F1 scores of 0.90+ on MER benchmarks.

**Why it's deferred**: The original vision of user-facing explanations ("voice tremor + averted gaze + flat affect → you seem sad") reintroduces the exact safety problem the rest of the documentation moved away from. Multimodal signals are weak (FER accuracy ~65-72% even for humans). Explaining internal state to a user from weak signals feels like mind-reading when it's right and gaslighting when it's wrong.

**If built (v3+)**:
- Multimodal fusion is **internal-only** — used to improve the AI's therapeutic reasoning, never surfaced as "I can see you're feeling X"
- May be used to generate better follow-up *questions* ("Would you like to talk about how you're doing?") but never *conclusions* ("You look sad")
- Requires extensive false-positive testing before any user-facing component

**Open source**: [Emotion-LLaMA](https://github.com/ZebangCheng/Emotion-LLaMA)

---

## 10. Guided Inner Parts Exploration — IFS-Inspired (v3+, Scripted Only)

**The research**: Internal Family Systems (IFS) therapy — dialoguing with different "parts" of yourself — is one of the fastest-growing therapeutic modalities, especially for trauma.

**Why it's deferred**: IFS is trauma-adjacent. An LLM improvising parts dialogue can destabilize vulnerable users. Free-form "talk to your inner critic" conversations are easy for a model to get wrong in ways that cause real harm — especially during crisis, dissociation risk, or suspected mania.

**If built (v3+)**:
- **Scripted flows only** — pre-authored by clinical consultants, not generated by the LLM
- **Contraindications enforced**: never activate during crisis state, active dissociation, suspected mania, or high distress scores
- **Exclusion criteria**: if user has flagged trauma history, require additional consent gate
- **Light touch only**: parts *identification* ("it sounds like part of you feels protective") is safer than parts *dialogue* ("what would your inner critic say?")
- Frame as structured self-exploration, explicitly NOT therapy

---

## 11. Wearable Biofeedback / HRV Integration (v3+)

**The research**: Heart Rate Variability is a biomarker for stress and emotional regulation. Apple Watch, Garmin, and Fitbit all collect it.

**Why it's deferred**: This is a scope trap for a web-first product. It requires:
- Native app (not web)
- Background sync infrastructure
- Device variability testing (Watch models, sensors, firmware)
- Permissions UX (HealthKit authorization flows)
- Data interpretation risk — HRV stress signals are noisy and context-dependent (exercise, caffeine, illness all affect HRV)
- Support complexity for edge cases

Additionally, HRV specificity for mental state is overstated. A dropping HRV could mean stress, or it could mean the user started exercising more. Making claims from HRV without clinical context is risky.

**If built (v3+)**:
- **Correlation only, no causation**: "Your HRV has been lower this week" not "you're more stressed"
- **User-initiated interpretation**: present data, let the user decide what it means
- Requires native app milestone first

**Open source**: [OpenHRV](https://github.com/JanCBrammer/OpenHRV)

---

# Do Not Build

> Features explicitly excluded from the roadmap due to safety, accuracy, or scope concerns.

| Feature | Reason |
|---|---|
| User-facing multimodal state explanations ("I can see you're sad because...") | Mind-reading from weak signals. Harmful when wrong. |
| Phone-sensor phenotyping (mindLAMP, AWARE) | Scope explosion, privacy risk, not needed when app telemetry suffices |
| Full JITAI nudging and notification optimization | Requires experimentation framework, notification policy, suppression rules — is a product in itself |
| Free-form IFS / parts dialogue | Trauma-adjacent, LLM improvisation risk, destabilization potential |
| Interpreting disengagement as deterioration without opt-in | Silence is not a diagnosis |
| Any feature that diagnoses or labels the user | Structural constraint, not negotiable |

---

## The Product That Has Never Existed

Put these together — the safe, high-impact features — and you get:

> **v1: An AI companion that understands your behavior patterns (app telemetry with consent), remembers your story with provenance (Mem0 + structured memory types), regulates your nervous system on request (somatic exercises with abort conditions), helps you do things not just talk about them (in-session behavioral activation), builds structured observations from evidence (not labels, internal-only formulation), makes important inferences auditable and correctable, understands Hinglish natively (IndicLID + IndicXlit), and meets you with the right therapeutic approach at the right time — with consent, kill switches, and contraindications on every feature.**
>
> **v2+: Extend with Graphiti temporal graph, Letta user-editable memory, IndicTrans2 full translation, and evidence-backed journey timeline once memory quality is proven.**

Every existing product has 1-2 of these. Nobody has all of them. And critically, nobody has the **longitudinal memory with proof** that makes them meaningful — because knowing that "walks help you" and "Sunday nights are your hardest time" and "your inner critic gets loud before presentations," *with timestamps, evidence, and user-confirmed confidence* — transforms generic advice into something that truly knows you and can prove it.

---

## Implementation Phasing

| Feature | Phase | Dependencies | Safety Gate |
|---|---|---|---|
| Structured clinical formulation (internal-only) | Phase 3-4 | Memory types, provenance fields | Internal/external boundary enforced |
| Inference provenance + correction hooks | Phase 3-4 | Memory system | Provenance on important inferences; "that's wrong" works |
| Somatic regulation (breathing, grounding) | Phase 4-5 | TTS, basic session flow | Contraindications + abort conditions tested |
| Indic language pipeline (IndicLID + IndicXlit) | Phase 4-5 | Python services | >90% accuracy on Hinglish test corpus |
| Digital phenotyping lite (app telemetry) | Phase 5-6 | Message history, session data | Consent flow, 1x outreach policy, kill switch functional |
| Behavioral activation lite (in-session) | Phase 5-6 | Memory system, session lifecycle | Follow-ups cite specific memories; no out-of-session nudges |
| Full memory browser (inspect/edit/delete) | Phase 5-6 | Stable extraction quality | Extraction quality proven before surfacing to users |
| Journey timeline — structured events | Phase 6 | Full memory + journey timeline | Every entry has source link; editability works |
| Journey timeline — trend overlays | Phase 6-7 | Structured timeline stable | Data-only, no narrative |
| Journey timeline — tentative narrative | Phase 7+ | Memory quality proven | Framed as "from your sessions"; fully editable |
| Feature safety scorecard review | Every phase | All features | Blocking gate — see scorecard table above |
| Graphiti temporal graph sidecar | v2 | Mem0 stable, Postgres | — |
| Letta user-editable memory | v2 | Graphiti, user trust established | — |
| IndicTrans2 full translation | v2 | Indic pipeline v1 stable | — |
| Emotion-LLaMA (internal-only) | v3+ | GPU infrastructure, model hosting | Internal-only validation |
| IFS-inspired exploration (scripted) | v3+ | Memory, clinical consultant review | Contraindication enforcement |
| HRV / wearable biofeedback | v3+ | Native app | Correlation-only framing |

---

## Sources

- [Graphiti — Temporal Knowledge Graph](https://github.com/getzep/graphiti)
- [Letta (MemGPT) — Stateful AI Memory](https://github.com/letta-ai/letta)
- [IndicLID — Indic Language Identification](https://github.com/AI4Bharat/IndicLID)
- [IndicXlit — Indic Transliteration](https://github.com/AI4Bharat/IndicXlit)
- [IndicTrans2 — Indic Translation](https://github.com/AI4Bharat/IndicTrans2)
- [L3Cube Code-Mixed NLP](https://github.com/l3cube-pune/code-mixed-nlp)
- [AI Mental Health Apps 2026](https://www.myflourish.ai/post/top-ai-mental-health-apps-2026)
- [Emotion-LLaMA (NeurIPS 2024)](https://github.com/ZebangCheng/Emotion-LLaMA)
- [mindLAMP Open Source Platform](https://docs.lamp.digital/)
- [OpenHRV Biofeedback](https://github.com/JanCBrammer/OpenHRV)
- [Digital Phenotyping Review 2025](https://www.sciencedirect.com/science/article/abs/pii/S0165178125001313)
- [Behavioral Activation Digital RCT](https://www.mdpi.com/2076-328X/15/11/1496)
- [Somatic Therapy Market Shift](https://gettherapybirmingham.com/the-great-shift-why-the-market-is-moving-from-cbt-to-somatic-and-neuro-experiential-therapies-for-trauma/)
- [Narrative Therapy with LLMs](https://arxiv.org/html/2507.20241)
- [NPR: AI for Mental Health Risks](https://www.npr.org/sections/shots-health-news/2025/09/30/nx-s1-5557278/ai-artificial-intelligence-mental-health-therapy-chatgpt-openai)
- [Woebot Shutdown Analysis](https://telehealth.org/news/ai-psychotherapy-shutdown-what-woebots-exit-signals-for-clinicians/)
- [HRV & Apple Watch Validation](https://www.mdpi.com/1424-8220/18/8/2619)
- [JITAI for Anxiety/Depression](https://pmc.ncbi.nlm.nih.gov/articles/PMC12339339/)
- [Box Breathing Animation](https://lassebomh.github.io/box-breathing/)
