---
name: AI Therapy Competitor & Ecosystem Research
description: Comprehensive research on open-source AI therapy projects, commercial competitors, research benchmarks, training datasets, and emotion-aware models — conducted 2026-03-23
type: project
---

# AI Therapy Competitor & Ecosystem Research
*Researched: 2026-03-23 by Compass (CMP)*

## Why: Operator requested landscape research to inform MindOverChatter's positioning, architecture choices, and potential feature gaps. Specifically for comparison beyond known players (Noah, Wysa, Woebot, Replika).

## How to apply: Reference when planning any sprint touching AI model selection, emotion pipeline, dataset strategy, safety benchmarks, or competitive feature differentiation.

---

## 1. Commercial Competitors (2025–2026)

### Ash (Slingshot AI) — THE most direct competitor
- $93M raised (a16z, Radical Ventures, Forerunner). Launched July 2025.
- Custom-built FOUNDATION MODEL for psychology — NOT a wrapper around GPT.
- Training: pre-trained on "largest dataset of behavioral health data ever assembled" covering CBT, DBT, ACT, psychodynamic, MI. Fine-tuned by clinical team (knows when to challenge, when to be silent, when to end). Final phase: RLHF on conversation outcomes.
- Infrastructure: trained on Nebius GPU clusters with DeepSpeed + Zero-3. Inference also on Nebius.
- Fine-tuning infrastructure: Together AI.
- Memory: remembers previous sessions, picks up where you left off.
- Voice + text input, pattern recognition across sessions.
- Free iOS/Android app, 50K beta users before launch.
- KEY INSIGHT: Ash proves the market wants a purpose-built therapeutic model, not a general LLM with therapy prompts.

### Sonia (YC W24)
- MIT researchers, $20/month or $200/year.
- SEVEN LLM calls per response — multi-agent therapeutic perspective synthesis.
- 6 therapist personas (age, gender, ethnicity, communication style).
- Full 30-minute CBT sessions by voice or text.
- Post-session: emotional resilience score, session summary, visual metaphor.
- KEY INSIGHT: Multi-agent "committee" approach for each response is a compelling pattern.

### Lyra Health — Clinical Grade AI (Oct 2025)
- Enterprise-focused (serves 20M people), launched "clinical-grade" chatbot.
- Built on Lyra Empower platform. Risk-flagging → escalation to 24/7 live care team.
- Targets mild/moderate challenges: burnout, sleep, stress.
- Published "Polaris Principles" — ethical AI in mental health framework.
- NOT a standalone app — integrated into employer benefit programs.

### Limbic Care — NHS Integration
- UKCA Class IIa certified medical device.
- Used by NHS Talking Therapies for intake/triage.
- PHQ-9/GAD-7 structured forms, routes to appropriate care levels.
- KEY INSIGHT: Regulatory certification is a differentiator for clinical settings.

### Youper (2025 update)
- Daily mood check-ins + AI-powered therapy sessions.
- Data visualizations of emotional patterns.
- ACT techniques, mindfulness, breathing exercises.
- Optional wearable data sync (heart rate for stress).
- PHQ-9/GAD-7 quick assessments.

### Bloom
- Workplace/career mental health focus.
- Career-related anxiety and stress management.

### Koko
- Hybrid model: AI moderation + peer-to-peer support.
- Users help each other under AI supervision.

### Tess
- Enterprise/healthcare/school deployment.
- Multilingual, highly customizable.
- Adapts to emotional state and cultural context.

### Healo (Infiheal)
- India-based. HIPAA compliant.
- AI coach + licensed therapist matching.
- Worksheets, meditation, safety plans.
- Mood tracking + personality tests.
- KEY INSIGHT: Direct Indian market competitor to MindOverChatter.

### Headspace / Talkspace / SonderMind
- First-gen apps adding generative AI chatbots.
- Talkspace's "Safe Talkspace AI agent" expected H1 2026.
- Not purpose-built — bolt-on to existing platforms.

---

## 2. Open-Source AI Therapy Projects (GitHub)

### MentalLLaMA — Most Important OSS Project
- GitHub: https://github.com/SteveKGYang/MentalLLaMA
- First open-source instruction-following LLM for interpretable mental health analysis.
- Models: MentalLLaMA-7B, MentalLLaMA-chat-7B, MentalLLaMA-chat-13B (LLaMA2 base).
- Dataset: IMHI (105K instruction samples, 8 tasks, 10 sources from social media).
- Benchmark: 19K test samples across 8 tasks.
- Published at ACM Web Conference 2024.
- RELEVANCE: The benchmark + dataset are directly useful for evaluating MindOverChatter's crisis/mood detection.

### PsyLLM — Diagnostic + Therapeutic Reasoning
- GitHub: https://github.com/Emo-gml/PsyLLM
- Arxiv: https://arxiv.org/abs/2505.15715 (May 2025)
- First LLM to combine DSM/ICD DIAGNOSTIC reasoning with therapeutic strategy selection.
- Trained on OpenR1-Psy dataset (multi-turn counseling + explicit reasoning traces).
- Supports CBT, ACT, psychodynamic approaches.
- Training via LLaMA-Factory framework.
- Weights on HuggingFace.
- RELEVANCE: The "reasoning trace" approach — showing WHY a therapeutic choice was made — is architecturally valuable.

### ChatPsychiatrist (EmoCareAI)
- GitHub: https://github.com/EmoCareAI/ChatPsychiatrist
- LLaMA-7B fine-tuned on Psych8K counseling instruction dataset (released HuggingFace, March 2024).
- 8K instruct-tuning samples from real counseling dialogues.
- RELEVANCE: Psych8K dataset is directly usable for evaluating or fine-tuning smaller models.

### BOLT — Behavioral Assessment Framework for LLM Therapists
- GitHub: https://github.com/behavioral-data/BOLT
- Arxiv: https://arxiv.org/abs/2401.00820
- Measures 13 psychotherapy techniques: reflections, questions, solutions, normalizing, psychoeducation, etc.
- KEY FINDING: GPT/LLaMA variants resemble LOW-quality therapy behavior (too much advice-giving when clients express emotion). They DO reflect on needs/strengths more than low-quality therapists.
- RELEVANCE: BOLT's 13-technique measurement framework maps closely to what MindOverChatter's Response Validator should score. Consider adopting BOLT metrics.

### Mental-LLM (neuhai)
- GitHub: https://github.com/neuhai/Mental-LLM
- Predicts mental health status from online text data.
- Published in ACM IMWUT 2024.

### Multimodal Emotion Recognition (maelfabien)
- GitHub: https://github.com/maelfabien/Multimodal-Emotion-Recognition
- Real-time web app for text + sound + video emotion recognition.
- Uses deep learning approaches for all three modalities.

---

## 3. Research Papers & Benchmarks

### CounselBench (June 2025)
- Arxiv: https://arxiv.org/html/2506.08584v1
- 100 mental health professionals scored 2,000 LLM responses.
- 6-dimension evaluation paradigm for single-turn counseling.
- Most comprehensive human vs. LLM judgment comparison to date.
- RELEVANCE: Use CounselBench dimensions to design MindOverChatter's ResponseValidator metrics.

### CBT-Bench (Oct 2024)
- Arxiv: https://arxiv.org/abs/2410.13218
- 3-level evaluation: basic knowledge → cognitive model understanding → therapeutic response generation.
- KEY FINDING: LLMs recite CBT knowledge well but FAIL at complex real-world scenarios requiring deep cognitive structure analysis.
- RELEVANCE: Validates MindOverChatter's approach of skill-guided prompting rather than relying on Claude's pre-training.

### LLM Survey in Psychotherapy (Feb 2025)
- Arxiv: https://arxiv.org/html/2502.11095v1
- 3-dimension taxonomy: Assessment, Diagnosis, Treatment.
- Tested 7 LLMs: GPT-4o, Claude 3.5 Sonnet, Llama 3.1, Gemini 1.5 Pro, Copilot.
- KEY FINDING: Models good at structured tasks (session length, goal-setting) but fail at integrative clinical reasoning and treatment implementation.
- RELEVANCE: Claude 3.5 Sonnet evaluated directly — confirms our model choice.

### CounseLLMe (2025, ScienceDirect)
- 400 simulated mental health counseling dialogues (LLM-LLM + LLM-human comparison).
- Haiku, LLaMAntino, GPT-3.5 tested in English and Italian.
- KEY FINDING: Emotional structure of LLM-LLM English conversations matches human patient-therapist trust exchanges.

### BOLT Nature Paper — Fine-tuning LLM therapy quality
- Nature npj Mental Health Research: https://www.nature.com/articles/s44184-025-00159-1
- Impact of fine-tuning LLMs on automated therapy quality, assessed by "digital patients."

### CBT-Effectiveness Assessment (2025)
- Arxiv: https://arxiv.org/html/2603.03862
- Direct assessment of LLM effectiveness at delivering CBT.

---

## 4. Training Datasets (Open Source)

### IMHI Dataset (MentalLLaMA)
- 105K instruction samples across 8 mental health analysis tasks.
- Sources: 10 social media datasets (Reddit, Twitter).
- Tasks: depression detection, suicide ideation, stress classification, etc.
- Available via: https://github.com/SteveKGYang/MentalLLaMA

### COUNSEL-CHAT
- HuggingFace: https://huggingface.co/datasets/nbertagnolli/counsel-chat
- GitHub: https://github.com/nbertagnolli/counsel-chat
- Real licensed therapist Q&A from counselchat.com.
- GOLD STANDARD for therapy response quality — verified therapists.
- Directly loadable via HuggingFace datasets library.

### mental_health_counseling_conversations (Amod)
- HuggingFace: https://huggingface.co/datasets/Amod/mental_health_counseling_conversations
- Real counseling Q&A from two online mental health platforms.
- Used to fine-tune Mistral-7B (GRMenon model).

### MentalChat16K (Penn Shen Lab, March 2025)
- HuggingFace: https://huggingface.co/datasets/ShenLab/MentalChat16K
- GitHub: https://github.com/PennShenLab/MentalChat16K
- Arxiv: https://arxiv.org/html/2503.13509v1
- 16,113 Q&A pairs: real anonymized PISCES clinical trial transcripts + GPT-3.5 synthetic.
- Covers depression, anxiety, grief.
- Used to fine-tune 7 LLMs with QLoRA.
- RELEVANCE: Most recent (2025) benchmark dataset with clinical trial sourcing.

### EmpatheticDialogues (Facebook Research)
- GitHub: https://github.com/facebookresearch/EmpatheticDialogues
- HuggingFace: https://huggingface.co/datasets/bdotloh/empathetic-dialogues-contexts
- 25K conversations grounded in emotional situations (25 emotion categories).
- Models trained on this are perceived more empathetic by humans.
- RELEVANCE: Core dataset for empathy-focused fine-tuning.

### Psych8K (EmoCareAI)
- HuggingFace: released March 2024
- 8K instruct-tuning samples from real counseling dialogues.
- Used to fine-tune LLaMA-7B for ChatPsychiatrist.

### HING-POEM (Hinglish)
- ACL 2024: https://aclanthology.org/2024.findings-naacl.290/
- Hinglish mental health AND legal counseling of crime victims.
- Task: Politeness Cause Elicitation and Intensity Tagging (PCEIT).
- ONLY known Hinglish therapy-adjacent dataset.
- RELEVANCE: Directly relevant to MindOverChatter's Hinglish support requirement.

### Mental Health Datasets Catalog
- GitHub: https://github.com/kharrigian/mental-health-datasets
- Comprehensive catalog of electronic media datasets for mental health modeling.
- Multilingual list: https://github.com/bucuram/multilingual-mental-health-datasets-nlp (108 datasets, 25 languages)

---

## 5. Open-Source Emotion-Aware Models

### Emotion-LLaMA (NIPS 2024 Winner)
- GitHub: https://github.com/ZebangCheng/Emotion-LLaMA
- Won MER-Noise track championship at MER2024 Challenge.
- Integrates audio + visual + text via emotion-specific encoders.
- MERR dataset: 28,618 coarse + 4,487 fine-grained annotations.
- Online demo on HuggingFace.
- RELEVANCE: Direct competitor/inspiration for MindOverChatter's multimodal emotion pipeline (Human.js + librosa).

### SenseVoice (Alibaba FunAudioLLM) — ALREADY IN USE by MindOverChatter
- GitHub: https://github.com/FunAudioLLM/SenseVoice
- HuggingFace: https://huggingface.co/FunAudioLLM/SenseVoiceSmall
- Open-sourced July 2024. 400K+ hours training data. 50+ languages.
- Emotion recognition: Happy, Sad, Angry, Neutral.
- SenseVoice-Small: 70ms inference for 10s audio (15x faster than Whisper-Large).
- Audio event detection: BGM, applause, laughter, crying, coughing.
- SenseVoice.cpp for edge/embedded deployment.
- NOTE: Already used in MindOverChatter's emotion-service (apps/server/src/services/ emotion layer).

### Mental-Health-Mistral-7B (GRMenon)
- HuggingFace: https://huggingface.co/GRMenon/mental-health-mistral-7b-instructv0.2-finetuned-V2
- Mistral-7B-Instruct-v0.2 fine-tuned on mental_health_counseling_conversations.
- QLoRA training. Validation loss: 0.6432 (3 epochs).
- Requires 16GB+ VRAM (24GB recommended), supports 4-bit/8-bit quantization.
- "Connor" persona — mental health assistant answering based on psychologist responses.
- Could run on Groq for fast inference.

### Models Running on Groq (2025 Research)
Per recent studies, these models are being used for mental health applications via Groq:
- Llama-4-scout-17b
- Mistral-Saba-24b
- Qwen-QWQ-32b
- GPT-4.1-Nano (OpenAI, not Groq)

---

## Key Takeaways for MindOverChatter

1. **Ash is the existential competitor** — purpose-built foundation model, $93M, iOS/Android. MindOverChatter's moat must be personal/local (single-user, no data sharing, privacy by design) vs. Ash's enterprise scale.

2. **BOLT's 13-technique framework** should be adopted by MindOverChatter's ResponseValidator. Currently the validator scores against "active directives" — adding BOLT metrics would give objective therapeutic quality measurement.

3. **CBT-Bench confirms skill-file approach is correct.** LLMs fail at complex CBT implementation without structured guidance — validates MindOverChatter's `.claude/skills/` approach.

4. **HING-POEM dataset** is the only known Hinglish therapy dataset. Consideration for augmenting crisis detection with PCEIT-derived politeness signals.

5. **PsyLLM's reasoning trace approach** — making diagnostic and therapeutic reasoning explicit — is a research direction worth tracking for future Claude prompt engineering.

6. **Healo (Infiheal)** is the direct Indian market competitor. Same demographic, HIPAA compliant, AI + therapist matching.

7. **Sonia's 7-LLM-calls-per-response pattern** is expensive but validates multi-perspective therapeutic reasoning. MindOverChatter's current single-call approach could evolve toward this.

8. **MentalChat16K + COUNSEL-CHAT** are the two best datasets for future fine-tuning experiments or evaluation of Claude's therapeutic response quality.
