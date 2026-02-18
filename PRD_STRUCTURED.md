# AI-Powered Hinglish Mental Wellness App -- Structured PRD

---

## 1. Product Vision & Overview

### What Is This Product
An AI-powered therapeutic journaling companion for Indian users, built as a multimodal mental wellness app that operates in Hinglish (Hindi-English code-switched language). The app combines conversational AI, voice input, facial expression analysis, and persistent memory to deliver a culturally adapted mental health experience.

### Recommended Product Name
**MindOverChatter** -- "Samjh" (understanding) + "AI" portmanteau. The AI literally means "understanding"; "moc" means "explained/made to understand." Tagline potential: "The AI that understands you." Clean, memorable, works in both Hindi and English, easy to pronounce for any audience.

### Other Name Candidates (Ranked)
1. **MindOverChatter** -- best overall
2. **MannMitra** -- "Mann" (mind/heart) + "Mitra" (friend). Your mind's friend. Deeply Indian, warm, non-clinical.
3. **Sukoon** -- peace, calm, tranquility. One word, powerful, works across Hindi-speaking audiences.
4. **FeelKaro** -- Peak Hinglish energy. "Feel karo" = start feeling / express your feelings. Young, casual, approachable. "karo" suffix universally understood Hinglish.
5. **Khayal** -- means both "thought" and "care." "Apna khayal rakhna" (take care of yourself) is one of the most common Hindi farewells. Double meaning makes it poetic.
6. **Chinta-Not** -- "Chinta" = worry. "Chinta Not" = don't worry. Punny, playful, bilingual. Could also style as "ChintaNot."
7. **MoodSaathi** -- "Saathi" = companion/partner. Your mood companion. Warm and relational.
8. **BaatCheet** -- conversation/dialogue/heart-to-heart. Authentic, familiar, non-intimidating.
9. **Ehsaas** -- feeling, awareness, realization. Elegant and deep. Evokes emotional awakening.
10. **ReflectKaro** -- "Reflect karo!" = do some reflection! Energetic, young, action-oriented.

### Target Audience
- Indian users (Hindi-English bilingual / Hinglish speakers)
- Users who type in Roman script (Romanized Hindi)
- Young, urban Indians comfortable with code-switching
- Low-awareness populations who may not engage with "mental health" framing directly
- Rural Indian adolescent girls (confirmed demand segment per Wysa/Wellcome funding)

### Market Context
- The Hinglish NLP ecosystem has reached production-readiness for text understanding (L3Cube's HingBERT family) and is rapidly maturing for speech recognition (Oriserve's fine-tuned Whisper)
- Voice emotion detection, facial expression analysis, and persistent memory architectures all have battle-tested open-source solutions
- Every technical component exists in production-ready or near-production form as of 2026
- Cultural adaptation -- not technology -- is the primary differentiator
- WhatsApp has 487M Indian users, making it a key accessibility channel
- Woebot shut down its D2C app in June 2025 to focus on enterprise, suggesting consumer mental health chatbot space has room for new entrants

---

## 2. Core Problem Statement

### Problems Solved
- Mental health stigma in India prevents direct engagement with "mental health" terminology
- Existing tools are not culturally adapted for Indian users (language, entry points, conversational norms)
- Hindi-English code-switching (Hinglish) is the natural communication mode for hundreds of millions of Indians, but most wellness apps operate in pure English or pure Hindi
- Users need an AI companion that remembers their story across sessions (persistent memory)
- Traditional therapy is inaccessible (cost, availability, stigma) for most Indians

### Why It Matters
- Clinical evidence: 2024 meta-analysis of 18 RCTs (~3,500 participants) found CBT chatbots produce significant anxiety symptom reduction (effect size g = -0.19, growing to g = -0.24 at 8 weeks)
- Therabot RCT (Dartmouth, March 2025) -- first RCT of a generative AI therapy chatbot -- showed groundbreaking results for depression and anxiety versus waitlist control
- Nature Communications Medicine 2025 study (N=540): GenAI-enabled CBT achieved significantly higher engagement than digital CBT workbooks with similar symptom reduction
- Wysa's Hindi version (March 2024) achieved 90% return rate -- confirming demand for culturally-sensitive Indian mental health tools
- Building for Indian users requires rethinking entry points, stigma, and conversational norms -- not just translation

---

## 3. User Personas & Segments

### Primary Users
- **Hinglish-speaking Indians**: Bilingual users who naturally code-switch between Hindi and English in daily communication
- **Roman-script typists**: Users who type Hindi in Roman/Latin script (not Devanagari) -- the dominant input mode for Hinglish
- **Young urban Indians**: Digitally savvy, comfortable with apps, but face stigma around mental health
- **Low-awareness populations**: People who may not identify their struggles as "mental health" issues; entry point should be reframed (e.g., Wysa replaced "mental health" with "akelapan"/loneliness)
- **Rural Indian adolescent girls**: A confirmed high-demand segment (Wysa + Wellcome + Imperial College London partnership, Feb 2026 funding of GBP 5.3M)

### Behavioral Patterns
- Users expect AI to remember their story across sessions
- Anonymous and stigma-free positioning is essential
- WhatsApp integration drives accessibility (487M Indian WhatsApp users)
- Users respond to culturally resonant framing (Hindi terms, familiar conversational patterns)
- Every 2 words out of 10 in conversational Hindi are English (per Shunya Labs research)

---

## 4. Feature Requirements

### P0 -- v1 (MVP) Features

#### 4.1 Claude-Powered Hinglish Conversation
- Use Anthropic Claude Sonnet 4 as the primary AI conversation engine
- Claude handles code-switching natively (Hinglish conversation)
- Streaming responses via WebSocket for a conversational feel
- Prompt caching: 1-hour cache on Sonnet, minimum 1024 tokens to reduce costs on static system prompt and user context
- Use Claude Haiku for lightweight tasks like emotion classification from text
- System prompt with therapeutic framework (~500 tokens)

#### 4.2 Voice Input (Speech-to-Text)
- Use faster-whisper (SYSTRAN/faster-whisper) with large-v3-turbo model for general STT
- 4x faster inference than OpenAI's original Whisper with identical accuracy
- Uses CTranslate2 with INT8 quantization
- Processes 13 minutes of audio in ~19 seconds on an RTX 3070 Ti
- Batch transcription per utterance (record -> transcribe -> respond) for v1 (simpler than real-time streaming)

#### 4.3 Browser-Side Facial Emotion Detection
- Use face-api.js (@vladmandic/face-api, actively maintained fork) running entirely in-browser via TensorFlow.js
- Detects 7 emotions from FER-2013/FERPlus/RAF-DB trained models
- Achieves 15-30 FPS with TinyFaceDetector
- Total model size: ~7MB (cacheable)
- Integration: sends only JSON emotion scores (e.g., {happy: 0.85, neutral: 0.12}) to backend via WebSocket
- Zero facial images transmitted to server
- Display clear visual indicator when emotion detection is active
- Allow opt-out at any time

#### 4.4 Voice Emotion Detection
- Use SenseVoice-Small (FunAudioLLM/SenseVoice, 8K+ GitHub stars) as primary engine
- Combines ASR + language identification + emotion recognition + audio event detection in a single model pass
- Outputs special tokens like `<|HAPPY|>` inline with transcription text
- Processes 70ms for 10 seconds of audio (15x faster than Whisper-Large)
- Detects 4 emotions: happy, sad, angry, neutral
- Supports 50+ languages
- Apache 2.0 licensed
- Add librosa for supplementary prosodic feature extraction (pitch contour, speaking rate) to enrich the emotion signal

#### 4.5 Text-to-Speech (Voice Responses)
- Primary: Kokoro TTS (hexgrad/kokoro, 82M parameters)
  - Ranked #1 on HuggingFace TTS Arena for single-speaker quality
  - Supports Hindi
  - Runs at 2x real-time on CPU
  - Costs <$0.06/hour of audio output
  - Apache 2.0 licensed
- Fallback: edge-tts (Microsoft neural voices including hi-IN)
  - Zero-setup fallback

#### 4.6 Persistent Memory (Cross-Session)
- PostgreSQL 16 + pgvector for unified storage (structured data + vector embeddings in one DB with full ACID transactions)
- Mem0 (mem0ai/mem0, 37K+ GitHub stars) for memory extraction and retrieval
  - Automatically extracts key facts from conversations
  - Stores across vector + key-value + graph databases simultaneously
  - Retrieves memories scored by relevance, importance, and recency
  - 26% higher accuracy than OpenAI's memory system
  - 90% token cost savings versus full-context approaches
  - SOC 2 and HIPAA compliant
- pgvector as the Mem0 backend
- Session-level summarization via Claude API after each session
- Store summaries and their embeddings for cross-session retrieval
- Temporal queries supported via single SQL combining vector similarity with date filters

#### 4.7 Hierarchical Memory Summarization (5 levels)
1. **Per-turn**: Emotional state, key facts extracted
2. **Session summary (300-500 words)**: Themes, insights, cognitive patterns, action items -- generated via Claude after each session
3. **Weekly rollup**: Patterns across sessions, progress on goals
4. **Monthly synthesis**: Long-term patterns, growth areas, recurring concerns
5. **User profile**: Core traits, persistent patterns, long-term goals (~2K tokens, always in context)

#### 4.8 Context Budget Per New Session (~4,000 tokens)
- System prompt with therapeutic framework: ~500 tokens
- User profile / core memory: ~500 tokens
- Most recent session summary: ~300 tokens
- Retrieved relevant past context (3-5 chunks): ~1,500 tokens
- Current conversation history: ~1,200 tokens

#### 4.9 CBT-Informed Session Structure
- Core technique: Thought Record Cycle
  - Situation -> Automatic Thought -> Emotion -> Evidence For/Against -> Balanced Thought -> Outcome
- AI guides users through each step sequentially
- Uses Socratic questioning (not directive advice):
  - "What evidence supports this thought?"
  - "What would you tell a friend in this situation?"
  - "Is there another way to look at this?"
- Cognitive distortion detection and gentle labeling:
  - All-or-nothing thinking
  - Catastrophizing
  - Mind reading
  - Should-statements
  - Emotional reasoning
- Claude can identify distortions in user text with appropriate system prompting

#### 4.10 Motivational Interviewing (MI-OARS) Conversational Style
- **Open-ended questions**: Requiring elaboration, not yes/no
- **Affirmations**: Recognizing strengths and efforts
- **Reflections**: Paraphrasing and deepening what the user said; aim for 2:1 reflection-to-question ratio
- **Summaries**: Weaving together themes
- Detect change talk using DARN-CAT framework:
  - Desire, Ability, Reason, Need, Commitment, Activation, Taking steps
- Selectively reinforce change talk through reflection

#### 4.11 Mood Tracking (Circumplex Model of Affect)
- Two dimensions:
  - **Valence** (pleasant <-> unpleasant): -1 to +1
  - **Arousal** (activated <-> deactivated): 0 to 1
- Maps emotions to 2D space:
  - Excited: high arousal, positive valence
  - Calm: low arousal, positive valence
  - Anxious: high arousal, negative valence
  - Sad: low arousal, negative valence

#### 4.12 Periodic Clinical Assessments
- **PHQ-9** (depression): 0-27 scale, administer weekly, free to use, no license required
- **GAD-7** (anxiety): 0-21 scale, administer weekly, free to use, no license required

#### 4.13 Crisis Safety Rails (MANDATORY)
- Every user message must pass through a crisis detection classifier
- Hard-coded escalation paths for suicidal ideation or self-harm
- Must immediately surface crisis resources regardless of conversation state:
  - 988 Suicide & Crisis Lifeline
  - iCall India: 9152987821
  - Vandrevala Foundation: 1860-2662-345
- App must NEVER claim to be a therapist
- Frame as "wellness companion" or "journaling assistant"
- APA's November 2025 Health Advisory explicitly urged investigation of products implying mental health expertise

#### 4.14 Hinglish Text Understanding
- HingRoBERTa (l3cube-pune/hing-roberta) for text-level emotion/sentiment classification
  - Best-performing model for Hinglish NER, sentiment, and classification
  - Built on XLM-RoBERTa, further pre-trained on Hinglish data
  - Outperforms even Google Gemini zero-shot on code-mixed NER tasks
- MuRIL (google/muril-base-cased) for any embedding or classification needing Romanized Hindi support
  - Pre-trained on 17 Indian languages plus transliterated (Romanized) text
  - Outperforms mBERT by 27% on transliterated Hindi
- AI4Bharat's IndicXlit if transliteration between Roman and Devanagari is needed

#### 4.15 UI/UX
- Custom calming palette built on shadcn/ui CSS variables
- shadcn.io offers 60+ pre-built themes including earth tones and organic palettes for "calming interfaces"
- tweakcn.com tool generates custom shadcn themes
- Suggested palette:
  - Soft cream background
  - Sage green primary
  - Warm lavender accent
  - Gentle transitions and animations
- Anonymous and stigma-free positioning

### P1 -- v2 Features

#### 4.16 Hinglish-Specific Whisper ASR
- Oriserve Whisper-Hindi2Hinglish (Oriserve/Whisper-Hindi2Hinglish-Prime)
  - Fine-tuned on ~550 hours of noisy Indian-accented audio
  - Reports 39% average performance improvement over pretrained Whisper for code-switched speech
  - A lighter "Swift" variant trades accuracy for speed

#### 4.17 9-Class Voice Emotion Detection
- emotion2vec+ (Alibaba DAMO Academy, ACL 2024)
  - Current state-of-the-art universal speech emotion model
  - Self-supervised pre-training on 262 hours of emotion data
  - Consistent improvements across 10 languages
  - Large variant (~300M params) classifies 9 emotion categories: angry, disgusted, fearful, happy, neutral, other, sad, surprised, unknown
  - Available via FunASR library

#### 4.18 Server-Side Facial Analysis with Bias Mitigation
- Move to server-side DeepFace for more accurate facial analysis
- Bias mitigation strategies:
  - Use AffectNet/RAF-DB trained models (more diverse)
  - RetinaFace or MTCNN detectors (perform better across skin tones than Haar cascades)
  - CLAHE preprocessing for low-light conditions
  - Extensive testing with Indian face datasets before deployment
- Server-side model options with benchmarks:

| Solution | Accuracy (FER2013) | Real-time FPS (CPU) | Emotions | License |
|---|---|---|---|---|
| DeepFace | ~65-67% | 8-15 | 7 | MIT |
| FER | ~65-70% | 15-25 | 7 | MIT |
| HSEmotion | N/A (AffectNet) | 10-20 | 8+ valence-arousal | Apache 2.0 |
| Py-Feat | Variable | ~0.7 | 7 + 20 Action Units | MIT |
| HF ViT (dima806) | ~91%* | Needs GPU | 7 | -- |

- *Note: 91% figure is on a custom test split; FER2013 human accuracy is only ~65-72%, so claims above ~75% on standard splits warrant skepticism

#### 4.19 Self-Editing Memory (Letta/MemGPT)
- Letta (formerly MemGPT, letta-ai/letta, 16.4K stars)
- Implements MemGPT paper's two-tier memory architecture:
  - **In-context memory**: Core memory block + recent message history
  - **Out-of-context memory**: Searchable recall + archival in vector DB
- Agent can self-edit its memory via tool calls:
  - Writing notes about the user
  - Updating understanding of their patterns
  - Summarizing older conversations when context window fills
- Maps directly to therapy context where AI maintains an evolving understanding of the user

#### 4.20 Native Hindi Voice Quality
- AI4Bharat's Indic Parler-TTS
  - Supports 21 Indian languages
  - Emotion-specific prompts
  - Controllable voice characteristics

#### 4.21 Weekly/Monthly Trend Visualizations

### P2 -- v3 Features

#### 4.22 Fine-Tuned HingRoBERTa
- Domain-specific emotion detection in journaling text

#### 4.23 Custom SER Model
- Fine-tuned on Hindi emotional speech
- IITKGP-SEHSC dataset

#### 4.24 Multimodal Emotion Fusion
- Combine text + voice + face signals

#### 4.25 WhatsApp Integration
- For accessibility (487M Indian WhatsApp users)

#### 4.26 Therapist Dashboard
- For users who want to share insights with their actual therapist

---

## 5. User Flows & Journeys

### Audio Processing Flow (Parallel Architecture)
```
Audio -> VAD -> [Parallel]
                 |-- STT: faster-whisper -> text + timestamps
                 |-- Emotion: SenseVoice or emotion2vec -> categorical emotion
                     + openSMILE -> prosodic features (F0, energy, jitter)
                 -> Fusion -> Combined result (text + emotion + prosody scores)
```

### Voice Input Flow (v1)
1. User records audio utterance
2. Batch transcription (record -> transcribe -> respond)
3. Parallel processing: STT + emotion analysis
4. Fused result sent to Claude for response generation

### Facial Emotion Flow (v1)
1. face-api.js processes webcam frames in-browser
2. Extracts 7-emotion JSON scores only
3. JSON scores sent to backend via WebSocket
4. No facial images ever leave the user's device
5. Clear visual indicator displayed when active
6. User can opt-out at any time

### Session Memory Flow
1. Per-turn: Extract emotional state and key facts
2. End of session: Claude generates session summary (300-500 words)
3. Summary + embeddings stored in pgvector
4. Weekly: Generate rollup of patterns across sessions
5. Monthly: Synthesize long-term patterns
6. User profile updated with core traits, persistent patterns, long-term goals

### Temporal Memory Query Flow
```sql
SELECT content, dominant_emotion, created_at
FROM session_segments
WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY embedding <=> $2  -- cosine similarity to query embedding
LIMIT 5;
```

### CBT Session Flow
1. Identify Situation
2. Surface Automatic Thought
3. Label Emotion
4. Gather Evidence For/Against the thought
5. Develop Balanced Thought
6. Assess Outcome

### Crisis Escalation Flow
1. Every user message passes through crisis detection classifier
2. If suicidal ideation or self-harm detected -> hard-coded escalation
3. Immediately surface crisis resources (988, iCall, Vandrevala Foundation)
4. Override any ongoing conversation state

### Cultural Entry Point (Wysa Insight)
- Replace "mental health" as entry point with culturally resonant terms (e.g., "akelapan" / loneliness)
- Build psychoeducation into onboarding
- Anonymous and stigma-free positioning

---

## 6. Technical Requirements

### Technology Stack (v1)

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React + Vite + TypeScript + shadcn/ui + Tailwind CSS | Largest ecosystem, best Claude Code training data, customizable wellness themes |
| Backend | FastAPI (Python 3.11+) | Native async, WebSocket streaming, excellent AI library ecosystem |
| Database | PostgreSQL 16 + pgvector | Single DB for structured data + vector embeddings |
| ORM | SQLAlchemy 2.0 + Alembic migrations | Standard, async-capable, well-documented |
| AI Conversation | Anthropic Claude Sonnet 4 (streaming) | Quality/cost balance, excellent streaming SDK |
| Speech-to-Text | faster-whisper (large-v3-turbo) | 4x faster than original Whisper, good Hindi support |
| Voice Emotion | SenseVoice-Small + librosa | ASR+emotion in one pass (70ms/10s audio), supplementary prosody features |
| Facial Emotion | face-api.js (browser-side) | Zero-server FER, complete privacy, 15-30 FPS |
| Text-to-Speech | Kokoro TTS (82M params, Apache 2.0) + edge-tts fallback | Kokoro: fast, lightweight, Hindi support. edge-tts: zero-setup Microsoft neural voices including hi-IN |
| Memory | Mem0 + pgvector backend | Automatic fact extraction, hybrid retrieval, HIPAA-compliant |
| Containerization | Docker Compose (5 services) | frontend, backend, db (pgvector/pgvector:pg16), whisper, tts |

### Production Starter Template
- Official Full Stack FastAPI Template: Docker Compose + PostgreSQL + React + JWT auth + Alembic migrations + Traefik + CI/CD
- Covers ~60% of boilerplate

### Containerization
- Docker Compose with 5 services:
  1. Frontend (React)
  2. Backend (FastAPI)
  3. Database (pgvector/pgvector:pg16)
  4. Whisper (STT service)
  5. TTS (Kokoro)

### API Integration Details
- Claude API: Streaming responses via WebSocket
- Prompt caching: 1-hour cache on Sonnet, minimum 1024 tokens
- Claude Haiku for lightweight tasks (emotion classification from text)

### Embedding Models
- **Open-source**: BAAI/bge-m3 (Apache 2.0, 100+ languages, dense+sparse+multi-vector) -- top open-source choice
- **API-based**: Cohere embed-v4 (explicitly supports Hindi); Voyage AI voyage-3.5-lite (Anthropic-recommended, $0.02/1M tokens)

### Key Libraries & Tools
- **Audio feature extraction**:
  - librosa: Pitch via pyin(), MFCCs via feature.mfcc(), energy via feature.rms(), spectral features
  - Parselmouth (Python wrapper for Praat): Jitter, shimmer, harmonics-to-noise ratio, formant tracking (GPL v3+ licensed)
  - pyAudioAnalysis: 34 short-term features with built-in SVM/kNN classifiers
  - openSMILE: eGeMAPSv02 feature set (88 features including F0, loudness, jitter, shimmer, MFCCs, spectral slopes) -- commercial use requires license from audEERING
- **Audio processing**: faster-whisper uses CTranslate2 with INT8 quantization

### AI4Bharat Ecosystem (IIT Madras)
- IndicBERT: Pre-trained encoder for Indian languages
- IndicTrans2: Translation for 22+ languages
- IndicXlit: Roman <-> Devanagari transliteration
- IndicWhisper: Fine-tuned Whisper ASR; lowest WER on 39 out of 59 Vistaar benchmarks, average 4.1 WER reduction over base Whisper
- Indic Parler-TTS: 21 Indian languages with emotion-specific prompts
- January 2026 release: Multilingual base encoder models in 270M, 1B, and 4B parameter sizes (state of the art for Indian language encoding)
- collabora/whisper-base-hindi: 8.49% WER on FLEURS-hi benchmark

---

## 7. AI/ML Requirements

### Hinglish NLP Models

#### Text Understanding
- **HingRoBERTa** (l3cube-pune/hing-roberta):
  - Best-performing model for Hinglish NER, sentiment, and classification
  - Built on XLM-RoBERTa, further pre-trained on Hinglish data
  - Trained on L3Cube-HingCorpus: 52.93M sentences, 1.04B tokens from Twitter
  - Outperforms Google Gemini zero-shot on code-mixed NER tasks
- **HingBERT** (l3cube-pune/hing-bert):
  - BERT-base further pre-trained on Hinglish
  - F1 ~0.70 on SentiMix benchmark for sentiment analysis
- **Google MuRIL** (google/muril-base-cased):
  - Best Google-backed option
  - Pre-trained on 17 Indian languages plus transliterated (Romanized) text
  - Outperforms mBERT by 27% on transliterated Hindi
  - Critical since Hinglish users typically type in Roman script
- **Sentiment classifier**: rohanrajpal/bert-base-multilingual-codemixed-cased-sentiment -- 3-class classification (negative/neutral/positive) on code-mixed text

#### Evaluation Benchmark
- GLUECoS (Microsoft Research): 6 tasks for Hindi-English code-switching -- primary evaluation standard

### Speech Recognition Models
- **Oriserve Whisper-Hindi2Hinglish** (Oriserve/Whisper-Hindi2Hinglish-Prime):
  - Fine-tuned on ~550 hours of noisy Indian-accented audio
  - 39% average performance improvement over pretrained Whisper for code-switched speech
  - Lighter "Swift" variant available
- **Shunya Labs Zero STT Hinglish** (shunyalabs/zero-stt-hinglish):
  - Natively processes Hinglish speech and generates mixed-script tokens
  - Designed for conversational Hindi where every 2 words out of 10 are English

### Voice Emotion Models
- **SenseVoice** (FunAudioLLM/SenseVoice, 8K+ stars):
  - ASR + language ID + emotion recognition + audio event detection in one pass
  - 70ms for 10s audio (15x faster than Whisper-Large)
  - 4 emotions: happy, sad, angry, neutral
  - 50+ languages, Apache 2.0
- **emotion2vec+** (Alibaba DAMO Academy, ACL 2024):
  - State-of-the-art universal speech emotion model
  - Self-supervised pre-training on 262 hours of emotion data
  - Large variant ~300M params, 9 emotion categories
  - Available via FunASR library
- **SpeechBrain** (speechbrain/emotion-recognition-wav2vec2-IEMOCAP):
  - ~75.3% accuracy on 4-class emotion recognition (anger, happiness, sadness, neutral)
  - Apache 2.0, 9.5K+ GitHub stars

### Facial Emotion Models
- **face-api.js** (@vladmandic/face-api): 7 emotions, in-browser, TensorFlow.js, 15-30 FPS, ~7MB
- **DeepFace**: ~65-67% accuracy FER2013, 8-15 FPS CPU, 7 emotions, MIT license
- **FER**: ~65-70% accuracy, 15-25 FPS, 7 emotions, MIT
- **HSEmotion**: AffectNet accuracy, 10-20 FPS, 8+ emotions + valence-arousal, Apache 2.0
- **Py-Feat**: Variable accuracy, ~0.7 FPS, 7 emotions + 20 Action Units, MIT
- **HF ViT (dima806)**: ~91% claimed (skepticism warranted), needs GPU, 7 emotions
- **Emotion-LLaMA** (research paper, arxiv 2406.11161): State-of-the-art multimodal emotion recognition combining audio, visual, and text; MERR dataset with 28,618 annotated samples across 9 emotion categories

### Prosodic Feature Extraction
- openSMILE: eGeMAPSv02 feature set -- 88 features including F0, loudness, jitter, shimmer, MFCCs, spectral slopes (near-real-time; commercial license required from audEERING)
- librosa: Pitch (pyin), MFCCs (feature.mfcc), energy (feature.rms), spectral features
- Parselmouth (Praat wrapper): Jitter, shimmer, harmonics-to-noise ratio, formant tracking (GPL v3+)
- pyAudioAnalysis: 34 short-term features with built-in SVM/kNN classifiers

### Memory / Retrieval AI
- **Mem0**: Automatic fact extraction, hybrid retrieval across vector + key-value + graph. 26% higher accuracy than OpenAI memory, 90% token savings
- **Letta/MemGPT**: Two-tier memory (in-context + out-of-context), self-editing memory via tool calls

### Psychological AI Framework
- CBT thought record cycle implemented via sequential AI prompting
- Cognitive distortion detection via Claude system prompting
- MI-OARS conversational style encoded in system prompt
- DARN-CAT change talk detection
- Circumplex model for mood tracking (valence + arousal)

### Training Data / Corpora Referenced
- L3Cube-HingCorpus: 52.93M sentences, 1.04B tokens from Twitter
- Psych8K dataset: 260 real counseling recordings (used by ChatPsychiatrist)
- IITKGP-SEHSC dataset: Hindi emotional speech (for v3 custom SER model)
- MERR dataset: 28,618 annotated samples across 9 emotion categories
- FER-2013, FERPlus, RAF-DB, AffectNet: Facial emotion training datasets
- IEMOCAP: Speech emotion corpus
- Vistaar benchmarks: 59 benchmarks for Hindi ASR

---

## 8. Data & Privacy Requirements

### Privacy Architecture (v1)
- Facial processing runs entirely in-browser (face-api.js via TensorFlow.js)
- Zero facial images transmitted to server
- Only JSON emotion scores sent to backend via WebSocket
- Never store, transmit, or log facial images
- Display clear visual indicator when emotion detection is active
- Allow opt-out at any time

### Compliance
- Mem0 is SOC 2 and HIPAA compliant -- important for mental health data
- pgvector with PostgreSQL provides full ACID transactions for all data

### Bias Concerns
- MIT Gender Shades study: error rates for darker-skinned females up to 34.7% versus <1% for lighter-skinned males
- FER2013 and most training datasets skew toward lighter-skinned subjects
- Mitigation strategies:
  - Use AffectNet/RAF-DB trained models (more diverse datasets)
  - RetinaFace or MTCNN detectors (perform better across skin tones than Haar cascades)
  - CLAHE preprocessing for low-light conditions
  - Extensive testing with Indian face datasets before deployment

### Framing & Liability
- App must NEVER claim to be a therapist
- Frame as "wellness companion" or "journaling assistant"
- APA November 2025 Health Advisory urged investigation of products implying mental health expertise

---

## 9. Non-Functional Requirements

### Performance Benchmarks
- SenseVoice: 70ms for 10 seconds of audio (15x faster than Whisper-Large)
- faster-whisper: 4x faster than original Whisper; large-v3-turbo processes 13 minutes of audio in ~19 seconds on RTX 3070 Ti
- face-api.js: 15-30 FPS with TinyFaceDetector, ~7MB model (cacheable)
- Kokoro TTS: 2x real-time on CPU
- openSMILE: eGeMAPSv02 feature extraction in near-real-time

### Architecture Priorities
- Simplicity and containerization (v1 priority)
- Single PostgreSQL database for everything (avoid separate vector database complexity)
- Docker Compose with 5 services for full containerization
- Buildable with Claude Code

### Scalability Considerations
- Prompt caching to reduce API costs (1-hour cache, min 1024 tokens)
- Claude Haiku for lightweight classification tasks (cost optimization)
- Kokoro TTS: <$0.06/hour of audio output
- Voyage AI embeddings: $0.02/1M tokens
- Mem0: 90% token cost savings versus full-context approaches

### Model Sizes
- Kokoro TTS: 82M parameters
- emotion2vec+ large: ~300M parameters
- face-api.js models: ~7MB total
- AI4Bharat January 2026 encoders: 270M, 1B, 4B parameter sizes

---

## 10. Content & Localization

### Hinglish Specifics
- Hinglish = Hindi-English code-switching; users naturally mix both languages
- Users typically type in Roman script (not Devanagari)
- Every 2 words out of 10 in conversational Hindi are English
- AI4Bharat IndicXlit available for Roman <-> Devanagari transliteration when needed
- MuRIL specifically designed for Romanized Hindi support (outperforms mBERT by 27%)
- L3Cube HingCorpus: 52.93M sentences from Twitter (represents real Hinglish usage)

### Key Research Groups Driving Hinglish NLP
- **L3Cube Pune**: HingBERT family, HingCorpus
- **AI4Bharat (IIT Madras)**: IndicBERT, IndicTrans2, IndicXlit, IndicWhisper, Indic Parler-TTS

### Tone & Framing
- Anonymous and stigma-free positioning is essential
- Replace clinical/mental health terminology with culturally resonant terms
  - Example: Wysa replaced "mental health" with "akelapan" (loneliness) for low-awareness populations
- Build psychoeducation into onboarding
- Warm, non-clinical conversational style
- App names reflect this: MannMitra (mind's friend), Sukoon (peace), FeelKaro, BaatCheet (conversation)

### Cultural Adaptation Insights (from Wysa)
- Cultural adaptation matters more than translation
- Wysa Hindi (March 2024) was a complete cultural redesign, not just a translation
- Achieved 90% return rate
- Rethinking entry points, stigma, and conversational norms is required

### Calming UI Design
- Soft cream background
- Sage green primary color
- Warm lavender accent
- Gentle transitions and animations
- shadcn/ui CSS variables with earth tones and organic palettes

---

## 11. Monetization & Business Model

### Cost Structure (Referenced)
- Kokoro TTS: <$0.06/hour of audio output
- Voyage AI embeddings: $0.02/1M tokens
- Claude Sonnet 4: prompt caching reduces cost (1-hour cache, min 1024 tokens)
- Claude Haiku: used for lightweight tasks to reduce costs
- Mem0: 90% token cost savings versus full-context approaches

### Market Opportunity
- Woebot (Stanford-developed, clinical gold standard) shut down D2C app in June 2025 to focus on enterprise -- consumer chatbot space has room for new entrants
- Wysa: 7M+ users across 105 countries; February 2026 funding GBP 5.3M from Wellcome with Imperial College London
- 487M Indian WhatsApp users represent a massive accessibility channel

### Key Design Insight (from Woebot)
- Everything Woebot says is written by human conversational designers, not generative AI
- They prioritize process factors (feeling heard) over content
- This is a crucial insight for designing the conversational experience

---

## 12. Success Metrics & KPIs

### Clinical Metrics
- PHQ-9 depression score (0-27 scale): Track weekly, measure reduction over time
- GAD-7 anxiety score (0-21 scale): Track weekly, measure reduction over time
- Clinical reference: CBT chatbot meta-analysis showed effect size g = -0.19 for anxiety (g = -0.24 at 8 weeks)

### Engagement Metrics
- Return rate (benchmark: Wysa Hindi achieved 90% return rate)
- Session frequency and duration
- Cross-session retention

### Technical Metrics
- STT accuracy: Oriserve reports 39% improvement over pretrained Whisper for code-switched speech
- ASR Word Error Rate: IndicWhisper achieves 4.1 WER reduction over base Whisper; collabora/whisper-base-hindi hits 8.49% WER on FLEURS-hi
- Sentiment classification: HingBERT F1 ~0.70 on SentiMix benchmark
- Facial emotion detection: face-api.js 15-30 FPS; FER2013 human accuracy baseline ~65-72%
- SpeechBrain: ~75.3% accuracy on 4-class emotion recognition
- Memory retrieval: Mem0 shows 26% higher accuracy than OpenAI's memory system

### Evaluation Benchmarks
- GLUECoS (Microsoft Research): 6 tasks for Hindi-English code-switching
- SentiMix benchmark: Sentiment analysis evaluation
- Vistaar benchmarks: 59 benchmarks for Hindi ASR
- FER2013: Facial emotion recognition baseline (human accuracy ~65-72%)
- FLEURS-hi: Hindi ASR evaluation
- HuggingFace TTS Arena: TTS quality evaluation

---

## 13. Competitive Analysis

### Wysa (Primary Competitor / Reference)
- Bengaluru-based mental health app
- 7M+ users across 105 countries
- Launched Hindi version March 2024 -- complete cultural redesign, not just translation
- Replaced "mental health" entry point with "akelapan" (loneliness) for low-awareness populations
- Built psychoeducation into onboarding
- Achieved 90% return rate
- February 2026 funding: GBP 5.3M from Wellcome with Imperial College London
- Focus: Adapting for rural Indian adolescent girls
- Key learnings: Cultural adaptation > translation; WhatsApp integration drives accessibility; anonymous + stigma-free positioning essential

### Woebot (Clinical Gold Standard)
- Stanford-developed
- Foundational RCT showed significant PHQ-9 depression reduction in 2 weeks
- Crucial design insight: Everything Woebot says is written by human conversational designers, not generative AI
- Prioritizes process factors (feeling heard) over content
- Shut down D2C app June 2025 to focus on enterprise
- This suggests consumer mental health chatbot space has room for new entrants

### Open-Source Projects Worth Studying

| Project | Description | Key Feature |
|---|---|---|
| ChatPsychiatrist (EmoCareAI/ChatPsychiatrist) | LLaMA-7B fine-tuned on Psych8K dataset (260 real counseling recordings) | Evaluates across 7 counseling skill metrics. CIKM 2023 publication. |
| Pandora (avocadopelvis/pandora) | "Gateway therapy" concept | Anxiety/depression support and crisis detection with hotline referral -- good safety-first design pattern |
| MindEase (PoyBoi/MindEase) | Multimodal approach | Combines chat with computer vision for behavioral analysis (detecting nail biting, etc.) -- innovative but experimental |
| Emotion-LLaMA (arxiv 2406.11161) | Research paper | State-of-the-art multimodal emotion recognition (audio + visual + text); MERR dataset 28,618 samples, 9 emotion categories |

---

## 14. Risks & Constraints

### Bias Risk
- FER2013 and most facial emotion training datasets skew toward lighter-skinned subjects
- MIT Gender Shades study: Error rates for darker-skinned females up to 34.7% versus <1% for lighter-skinned males
- Must test extensively with Indian face datasets before deployment

### Regulatory/Legal Risk
- APA November 2025 Health Advisory explicitly urged investigation of products implying mental health expertise
- App must NEVER claim to be a therapist
- Must frame as "wellness companion" or "journaling assistant"

### Safety Risk
- Crisis detection must be robust -- every user message must pass through crisis detection classifier
- Hard-coded escalation paths required for suicidal ideation or self-harm
- Cannot rely on AI judgment for crisis situations -- must be deterministic

### Technical Constraints
- Standard Whisper transcribes in either Hindi (Devanagari) OR English, but not both simultaneously within a sentence -- requires specialized fine-tuned models
- FER2013 human accuracy is only ~65-72%, so facial emotion claims above ~75% on standard splits warrant skepticism
- openSMILE commercial use requires license from audEERING
- Parselmouth is GPL v3+ licensed (copyleft implications)
- Context budget per session limited to ~4,000 tokens

### Assumptions
- Claude handles Hinglish code-switching well (stated as v1 assumption)
- Hinglish users typically type in Roman script
- Cultural adaptation is more important than raw technical capability

### Dependencies
- Anthropic Claude API (Sonnet 4, Haiku) availability and pricing
- Open-source model maintenance (face-api.js fork, HingBERT, SenseVoice, etc.)
- AI4Bharat ecosystem continued development
- PostgreSQL 16 + pgvector stability

---

## 15. Roadmap & Phases

### v1 (MVP) -- Ship First
- Claude-powered Hinglish conversation (Claude handles code-switching natively)
- faster-whisper for voice input (large-v3-turbo)
- face-api.js for browser-side facial emotion detection
- pgvector for unified storage
- Mem0 for memory management
- Kokoro TTS for voice responses (edge-tts fallback)
- CBT-informed session structure with MI-OARS conversational style
- PHQ-9/GAD-7 periodic assessments
- Crisis safety rails (mandatory)
- HingRoBERTa for text emotion/sentiment classification
- MuRIL for Romanized Hindi support
- SenseVoice-Small for voice emotion detection + librosa for prosody
- Session-level summarization via Claude API
- Fully containerizable via Docker Compose (5 services)
- Buildable with Claude Code
- Calming UI with shadcn/ui + Tailwind CSS

### v2 -- Enhanced Hinglish & Emotion
- Oriserve's Hinglish-specific Whisper model for better code-switched ASR
- emotion2vec+ for 9-class voice emotion detection
- Server-side DeepFace for more accurate facial analysis with bias mitigation
- Letta/MemGPT patterns for self-editing memory
- Indic Parler-TTS for native Hindi voice quality
- Weekly/monthly trend visualizations

### v3 -- Advanced & Integrations
- Fine-tuned HingRoBERTa for domain-specific emotion detection in journaling text
- Custom SER model fine-tuned on Hindi emotional speech (IITKGP-SEHSC dataset)
- Multimodal emotion fusion (text + voice + face)
- WhatsApp integration for accessibility
- Therapist dashboard for users who want to share insights with their actual therapist

### Guiding Principle
> "The most important thing is to ship v1 with strong safety rails and iterate from real user feedback."

---

## 16. Anything Else

### Recommended v1 Model/Library Choices Summary
| Component | v1 Choice | Rationale |
|---|---|---|
| Conversation AI | Claude API (Sonnet 4 + Haiku) | Handles Hinglish natively, streaming, cost-effective with caching |
| Hinglish Text | HingRoBERTa | Best Hinglish NER/sentiment/classification |
| Romanized Hindi | MuRIL | 27% better than mBERT on transliterated Hindi |
| Transliteration | IndicXlit | Roman <-> Devanagari as needed |
| STT | faster-whisper (large-v3-turbo) | 4x faster, good Hindi, batch per utterance |
| Voice Emotion | SenseVoice-Small + librosa | Single-pass ASR+emotion, supplementary prosody |
| Facial Emotion | face-api.js (browser) | Privacy-first, 15-30 FPS, ~7MB |
| TTS | Kokoro (primary) + edge-tts (fallback) | #1 TTS Arena, Hindi, <$0.06/hr, Apache 2.0 |
| Memory | Mem0 + pgvector | HIPAA-compliant, 26% better than OpenAI memory |
| Database | PostgreSQL 16 + pgvector | Single DB for everything, ACID, temporal+vector queries |
| Embeddings | BAAI/bge-m3 (open) or Voyage 3.5-lite (API, $0.02/1M tokens) | Multilingual, 100+ languages |

### Shunya Labs Hinglish STT Model
- shunyalabs/zero-stt-hinglish: Trained to natively process Hinglish speech and generate mixed-script tokens
- Designed for the reality that every 2 words out of 10 in conversational Hindi are English

### Optimal Audio Integration Architecture
```
Audio -> VAD -> [Parallel]
                 |-- STT: faster-whisper -> text + timestamps
                 |-- Emotion: SenseVoice or emotion2vec -> categorical emotion
                     + openSMILE -> prosodic features (F0, energy, jitter)
                 -> Fusion -> Combined result (text + emotion + prosody scores)
```

### Additional Sentiment Resources
- rohanrajpal/bert-base-multilingual-codemixed-cased-sentiment: 3-class classification (negative/neutral/positive) on code-mixed text

### Full Stack FastAPI Template
- Includes: Docker Compose + PostgreSQL + React + JWT auth + Alembic migrations + Traefik + CI/CD
- Covers ~60% of the boilerplate for this project

### Key Numeric Facts Referenced
- L3Cube-HingCorpus: 52.93M sentences, 1.04B tokens
- Oriserve training: ~550 hours of noisy Indian-accented audio
- emotion2vec+ training: 262 hours of emotion data
- MERR dataset: 28,618 annotated samples, 9 emotion categories
- Psych8K dataset: 260 real counseling recordings
- Wysa: 7M+ users, 105 countries, 90% return rate
- WhatsApp India: 487M users
- Wysa Feb 2026 funding: GBP 5.3M from Wellcome
- Meta-analysis: 18 RCTs, ~3,500 participants
- CBT chatbot effect size: g = -0.19 (g = -0.24 at 8 weeks)
- Nature study: N=540
- openSMILE eGeMAPSv02: 88 features
- SenseVoice: 70ms per 10s audio, 4 emotions, 50+ languages
- emotion2vec+ large: ~300M params, 9 categories, 10 languages
- Kokoro TTS: 82M params, 2x real-time CPU, <$0.06/hr
- face-api.js: 7 emotions, 15-30 FPS, ~7MB
- faster-whisper: 4x faster, 13min audio in ~19s on RTX 3070 Ti
- Context budget: ~4,000 tokens per session
- User profile: ~2K tokens always in context
- Prompt cache: 1-hour, min 1024 tokens
- HingBERT sentiment F1: ~0.70
- MuRIL: 27% better than mBERT on transliterated Hindi
- Oriserve: 39% improvement over pretrained Whisper
- IndicWhisper: 4.1 WER reduction, 39/59 Vistaar benchmarks best
- collabora/whisper-base-hindi: 8.49% WER on FLEURS-hi
- SpeechBrain: 75.3% accuracy, 9.5K+ GitHub stars
- Mem0: 37K+ stars, 26% higher accuracy, 90% token savings
- Letta: 16.4K stars
- SenseVoice: 8K+ stars
- Docker Compose: 5 services
- AI4Bharat Jan 2026 encoders: 270M, 1B, 4B params
- PHQ-9: 0-27 scale
- GAD-7: 0-21 scale
- Gender Shades bias: 34.7% error (darker females) vs <1% (lighter males)
- FER2013 human accuracy: ~65-72%
- Voyage AI: $0.02/1M tokens
- Session summary: 300-500 words
