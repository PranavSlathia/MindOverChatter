---
name: emotion-pipeline
description: Multimodal emotion signal merging pipeline combining face, voice, and text channels into a unified emotional context for therapeutic conversations.
user-invocable: false
---

# Emotion Pipeline

## Purpose

Multimodal emotion detection and signal merging for MindOverChatter. Three independent channels -- face, voice, and text -- run in parallel and merge into a single emotional context payload before reaching the AI. This gives the therapist AI a richer, more accurate read on the user's emotional state than any single channel could provide.

## Channels

### Face Channel (Browser-Side)

- **Library**: Human.js (@vladmandic/human, successor to the archived Human.js)
- **Frame rate**: 15-30 FPS sampling from webcam stream
- **Model size**: ~10MB, cached in browser after first load
- **Emotions detected**: 7 -- `happy`, `sad`, `angry`, `fearful`, `disgusted`, `surprised`, `neutral`
- **Output**: JSON object with emotion label and confidence score per emotion
- **Privacy**: ZERO images leave the browser. All face detection and emotion classification runs entirely client-side via TensorFlow.js. The browser only emits a JSON summary of detected emotions -- never raw pixels, frames, or any image data.

```typescript
// Example face channel output
{
  dominant: "sad",
  scores: {
    happy: 0.02,
    sad: 0.71,
    angry: 0.05,
    fearful: 0.08,
    disgusted: 0.01,
    surprised: 0.03,
    neutral: 0.10
  },
  timestamp: 1708300000000
}
```

### Voice Channel (Server-Side)

Two sub-components extract complementary signals from the user's audio:

**SenseVoice-Small (Emotion Classification)**
- Model: FunAudioLLM/SenseVoice-Small
- Detects 4 emotion categories from speech audio
- Latency: ~70ms per 10 seconds of audio
- Runs inside the emotion service container (port 8002)

**Librosa Prosody Analysis**
- Extracts acoustic features that carry emotional information:
  - **Pitch (F0)**: Mean, standard deviation, and contour -- rising pitch may indicate anxiety or excitement
  - **MFCCs**: Mel-frequency cepstral coefficients capturing vocal timbre
  - **Energy/RMS**: Volume dynamics and variation
  - **Speaking rate**: Words per minute derived from voiced segment timing
- These prosodic features supplement the categorical emotion label with continuous signals

### Text Channel (AI-Side)

- **Model**: Claude Haiku for fast emotion classification
- **Input**: The user's transcribed message text
- **Output**: Inferred emotional state based on linguistic content, word choice, and conversational context
- **Role**: Catches emotional signals that voice and face may miss (e.g., sarcasm, subtle distress cues in word choice, Hinglish emotional idioms)

## Parallel Processing Pattern

The frontend orchestrates parallel processing to minimize latency:

```
User speaks
    |
    v
[Browser captures audio + face data simultaneously]
    |
    +--> Audio blob --> POST /transcribe (Whisper service, port 8001)
    |                   Returns: { text, language, confidence }
    |
    +--> Audio blob --> POST /analyze (Emotion service, port 8002)
    |                   Returns: { voiceEmotion, prosody }
    |
    +--> Face JSON  --> Already computed client-side (Human.js)
    |
    v
[Frontend merges all results into unified payload]
    |
    v
[Send merged payload via POST /api/sessions/:id/messages]
```

Both the Whisper and Emotion HTTP calls fire simultaneously. The frontend awaits both responses, then merges them with the Human.js results before sending a single POST request to the backend.

## Signal Merging

The merged payload sent via `POST /api/sessions/:id/messages`:

```typescript
// POST /api/sessions/:id/messages
{
  text: "I'm doing okay I guess",             // from Whisper transcription
  voiceEmotion: {                               // from SenseVoice
    label: "sad",
    confidence: 0.78
  },
  prosody: {                                    // from librosa
    pitchMean: 142.5,
    pitchStd: 18.3,
    energy: 0.34,
    speakingRate: 112,
    mfccs: [/* 13 coefficients */]
  },
  facialEmotion: {                              // from Human.js
    dominant: "sad",
    scores: { happy: 0.02, sad: 0.71, /* ... */ }
  },
  language: "hi-en",                            // detected by Whisper
  audioConfidence: 0.92
}
```

The backend AI layer (Neura) receives this merged payload and uses all three emotion signals to inform its therapeutic response. When channels disagree (e.g., text says "I'm fine" but face and voice indicate sadness), the AI can gently explore that discrepancy -- a core therapeutic skill.

## Signal Weighting Policy

Face and voice are **weak signals**, not ground truth. FER accuracy is ~65-72% even for humans on standard benchmarks. Signal weights:

| Channel | Weight | Rationale |
|---------|--------|-----------|
| Text (self-report + longitudinal) | 0.8 | Highest-signal: what the user actually says and how it changes over time |
| Voice (SenseVoice + prosody) | 0.5 | Moderate: prosodic features add value but are noisy |
| Face (Human.js) | 0.3 | Weakest: FER models have known accuracy limits and bias concerns |

**How to use**: Emotion signals should prompt follow-up questions ("You seem a bit tense — how are you feeling?"), never conclude emotional state on their own. The definitive source for mental state assessment is structured self-report plus longitudinal change across sessions.

## Privacy Guarantees

| Data Type | Where It Lives | Transmitted? |
|-----------|---------------|-------------|
| Facial images / webcam frames | Browser memory only | NEVER -- zero images leave the browser |
| Face emotion JSON | Browser -> REST POST | Yes, JSON scores only |
| Raw audio blobs | Browser -> Docker services | Yes, within local Docker network |
| Audio files | Docker volumes | Stays local, never leaves Docker volumes |
| Transcribed text | Backend -> AI | Yes, for therapeutic processing |
| Prosody features | Emotion service -> Backend | Yes, numeric features only |

The architecture ensures that the most sensitive biometric data (facial imagery) never leaves the user's browser, and raw audio stays within the local Docker environment.
