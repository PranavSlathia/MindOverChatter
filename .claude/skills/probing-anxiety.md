---
name: probing-anxiety
description: Probing flow for excessive worry and generalized anxiety presentations
user-invocable: false
---

## Entry Signals

- User describes persistent worry that feels hard to control
- User mentions physical symptoms like racing heart, tension, restlessness, or stomach issues
- User reports difficulty concentrating or a mind that "won't stop"
- User expresses dread or fear about the future without a specific trigger
- User describes avoidance of situations, places, or activities due to worry

## Probing Questions

Surface these NATURALLY across multiple turns. Never ask more than one probing question per response.

1. **Onset/Duration**: "When did you first start noticing this worry? Was there something that set it off, or did it build up over time?"
   - Gathers: timeline, trigger vs gradual onset
2. **Scope**: "Is the worry mostly about one thing, or does it jump around to different areas of your life?"
   - Gathers: generalized vs focused, domains of concern
3. **Physical experience**: "How does the anxiety show up in your body — any tension, racing heart, trouble sleeping?"
   - Gathers: somatic symptoms, physiological arousal
4. **Controllability**: "When the worry starts, how easy or hard is it to step back from it?"
   - Gathers: perceived control, cognitive entrapment
5. **Functional impact**: "Has the worry been getting in the way of things you need or want to do?"
   - Gathers: avoidance patterns, impairment
6. **Protective factors**: "What helps you feel even a little calmer — anything that works, even sometimes?"
   - Gathers: existing coping, grounding techniques, support
7. **Frequency**: "How often does this come up — is it most days, or more tied to certain situations?"
   - Gathers: pattern, situational vs pervasive

## Evidence Checklist

- [ ] Duration established
- [ ] Scope of worry identified (generalized vs specific domains)
- [ ] Physical or somatic symptoms explored
- [ ] Controllability of worry assessed
- [ ] At least one functional impact domain identified
- [ ] Protective factors or coping strategies explored

## Internal Formulation Template

For internal tracking only. NEVER shown to the user. NEVER use diagnostic labels.

```json
{
  "presentation": "excessive worry with difficulty controlling anxious thoughts",
  "features": ["restlessness", "muscle tension", "sleep difficulty", "concentration problems", "irritability", "fatigue"],
  "duration": "approximate timeframe",
  "frequency": "most days | situational | episodic",
  "scope": "generalized | domain-specific",
  "functional_impact": ["work", "social", "daily routines", "relationships"],
  "severity": "mild | moderate | significant",
  "protective_factors": ["noted coping or supports"],
  "evidence_confidence": 0.0,
  "gaps": ["areas still unexplored"]
}
```

## Safety Triggers

Escalate immediately to crisis protocol if during probing the user:

- Expresses suicidal ideation or wishes to die as an escape from anxiety
- Describes self-harm as a coping mechanism for overwhelming anxiety
- Reports complete inability to function (cannot eat, sleep, work, or leave home)
- Mentions substance use escalation to manage anxiety
- Describes a panic state with fear of imminent death (transition to panic probing)
