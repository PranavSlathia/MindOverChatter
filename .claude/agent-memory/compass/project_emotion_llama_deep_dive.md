---
name: Emotion-LLaMA Deep Dive Research
description: Full technical research on Emotion-LLaMA (NeurIPS 2024): architecture, benchmarks, Groq compatibility, and integration assessment for MindOverChatter — conducted 2026-03-23
type: project
---

# Emotion-LLaMA Deep Dive
*Researched: 2026-03-23 by Compass (CMP-002)*

## Why: Operator requested thorough research into whether Emotion-LLaMA could replace or supplement MindOverChatter's existing emotion detection (Human.js, SenseVoice, Claude Sonnet text inference).

## How to apply: Reference when any sprint proposes changes to the emotion pipeline, considers adding multimodal fusion services, or evaluates new emotion models. Bottom line is: not a fit for our use case at this stage.

---

## What It Is

- NeurIPS 2024 paper. Multimodal emotion **classifier + reasoner** (not a conversational model).
- Input: video file (audio + visual + optional transcript together). Output: 9-category emotion label + natural-language explanation of why.
- Nine categories: neutral, happy, angry, worried, surprised, sad, fearful, doubtful, contemptuous. Fixed taxonomy. No continuous valence/arousal.
- Does NOT hold conversations. Does NOT do therapy. Takes a video clip, returns a label + explanation paragraph.

## Architecture

- Base: LLaMA 2 7B Chat
- Fine-tuning: LoRA on Q/V projections (r=64, α=16). Only 34M trainable params (0.495% of total).
- Four encoders bolted on and frozen:
  - HuBERT-large (Chinese) — audio/prosody
  - EVA ViT 448×448 — global visual (peak frame)
  - MAE ViT — local facial expressions (frame-wise)
  - VideoMAE — temporal facial dynamics
- All encoder outputs projected to 4096-d space, concatenated with text tokens, fed to frozen LLaMA backbone.
- Requires MiniGPT-v2 checkpoint as pre-alignment starting point (3 separate checkpoints needed to run inference).
- Training: 4× A100 GPUs, ~20 hours, 300K steps. MERR dataset (28,618 coarse + 4,487 fine-grained samples).

## Hardware Requirements

- Inference: 24GB+ VRAM (all four encoders + LLaMA 2 7B loaded simultaneously)
- Disk: 50GB+ free space
- NOT runnable on CPU. NOT streamable. Batch video-clip inference only.

## Benchmarks

- MER2023 Challenge F1: 0.9036 (A+V+T combined; in-domain test set)
- EMER Clue Overlap: 7.83/10 (emotion reasoning quality, GPT-4 judged)
- DFEW zero-shot WAR: 59.37% (beats GPT-4V at 55.00%; honest out-of-domain number)
- DFEW fine-tuned WAR: 77.06%

## Groq Compatibility

**Cannot run on Groq.** Groq does not support custom weight uploads (open community feature request, no official ETA). Even if it did, the four encoder models require combined GPU memory far beyond standard LLaMA 2 7B. The GGUF quantized version (tensorblock/Emotion-LLaMA-GGUF on HuggingFace) strips all multimodal encoders — it is text-only weights, not an emotion model.

## License Risk

- Code: BSD 3-Clause (permissive)
- Training data (MERR/MER2023): EULA restricts to **research use only**
- Model weights were trained on restricted-license data — commercial use risk unresolved by authors
- LLaMA 2 base model has separate Meta commercial license

## Production Readiness

Research-grade only. Signals: 45 HuggingFace downloads/month, no official inference provider, empty model card, three checkpoint files required, Conda environment setup required, no streaming API.

## Integration Verdict for MindOverChatter

**No integration recommended.** It solves a different problem (batch video clip classification) vs. our need (real-time streaming therapy conversation emotion signals).

| Our signal | Emotion-LLaMA equivalent | Verdict |
|-----------|--------------------------|---------|
| Human.js (browser, real-time, continuous, no GPU) | EVA+MAE+VideoMAE batch | Human.js wins for our use case |
| SenseVoice 70ms streaming, 50+ languages | HuBERT-large batch, Chinese-primary | SenseVoice wins |
| Claude Sonnet 4 text (therapeutic context-aware) | LLaMA 2 7B LoRA (not conversational) | Claude wins by large margin |

## One Genuinely Interesting Idea (Track, Don't Build Now)

Emotion-LLaMA's unique capability is cross-modal conflict reasoning: "face says calm, voice says tense, words are ambiguous — dominant signal is tense." Our current approach uses static weights (face=0.3, voice=0.5, text=0.8) that don't adapt to conflicts.

A higher-leverage alternative with no new infrastructure: a Claude-based reconciler prompt that takes structured JSON from Human.js + SenseVoice + session context and outputs a fusion reasoning trace. No new GPU, no new Docker service, inherits Claude's therapeutic framing.

## v2 Status (January 2026)

Emotion-LLaMAv2 paper published (arxiv 2601.16449). Improvements: removes OpenFace dependency, new Conv-Attention pre-fusion, richer audio tokens. Performance: 78.91% MER-UniBench, 66.63% MMEVerse-Bench. Code "promised" at GitHub but not yet confirmed available. Weights not yet released under clear commercial license.

## Re-evaluate When

v2 weights release under commercial-friendly license AND remove the MiniGPT-v2 dependency AND provide a streaming/real-time API mode. Current v1 situation warrants no further investigation.

