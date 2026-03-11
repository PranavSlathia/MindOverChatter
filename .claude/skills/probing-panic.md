---
name: probing-panic
description: Probing flow for panic attacks and acute fear episode presentations
user-invocable: false
---

## Entry Signals

- User describes sudden, intense episodes of fear or terror
- User mentions physical symptoms like chest pain, shortness of breath, dizziness, or feeling of choking
- User reports fear of "going crazy," losing control, or dying during episodes
- User describes avoidance of places or situations where an episode occurred
- User uses phrases like "panic attack," "anxiety attack," or "I thought I was dying"

## Probing Questions

Surface these NATURALLY across multiple turns. Never ask more than one probing question per response.

1. **Episode description**: "Can you walk me through what happens when one of these episodes hits? What does it feel like?"
   - Gathers: symptom profile, subjective experience
2. **Onset/Duration**: "When did these episodes start? And how long does a typical one last?"
   - Gathers: timeline, episode duration (minutes vs hours)
3. **Frequency**: "How often are they happening — once a week, more, less?"
   - Gathers: frequency pattern, whether escalating
4. **Triggers**: "Do you notice anything that tends to set them off, or do they seem to come out of nowhere?"
   - Gathers: cued vs uncued, situational triggers
5. **Between episodes**: "Between episodes, do you worry about having another one?"
   - Gathers: anticipatory anxiety, fear-of-fear cycle
6. **Avoidance**: "Have you started avoiding certain places or situations because of the episodes?"
   - Gathers: behavioral avoidance, agoraphobic patterns
7. **Coping**: "When you feel one coming on, is there anything that helps — even a little?"
   - Gathers: existing coping strategies, grounding awareness

## Evidence Checklist

- [ ] At least one episode described in detail (symptoms, duration)
- [ ] Frequency established
- [ ] Trigger pattern explored (cued vs spontaneous)
- [ ] Anticipatory anxiety assessed
- [ ] Avoidance behavior explored
- [ ] At least one coping strategy or support identified

## Internal Formulation Template

For internal tracking only. NEVER shown to the user. NEVER use diagnostic labels.

```json
{
  "presentation": "recurrent acute fear episodes with physical symptoms",
  "features": ["chest tightness", "shortness of breath", "dizziness", "heart racing", "derealization", "fear of dying", "fear of losing control"],
  "episode_duration": "minutes | extended",
  "onset": "approximate timeframe of first episode",
  "frequency": "weekly | monthly | irregular",
  "trigger_pattern": "cued | uncued | mixed",
  "anticipatory_anxiety": true,
  "avoidance_domains": ["specific situations or places"],
  "functional_impact": ["mobility", "work", "social", "independence"],
  "severity": "mild | moderate | significant",
  "protective_factors": ["noted coping or supports"],
  "evidence_confidence": 0.0,
  "gaps": ["areas still unexplored"]
}
```

## Safety Triggers

Escalate immediately to crisis protocol if during probing the user:

- Expresses suicidal ideation or feeling they cannot endure more episodes
- Describes self-harm to cope with or prevent panic episodes
- Reports symptoms that suggest a medical emergency (prolonged chest pain, fainting) — encourage seeking immediate medical attention
- Mentions substance use to prevent or manage episodes
- Describes complete social isolation due to avoidance
