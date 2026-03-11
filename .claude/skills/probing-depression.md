---
name: probing-depression
description: Probing flow for persistent low mood and anhedonia presentations
user-invocable: false
---

## Entry Signals

- User mentions feeling sad, hopeless, empty, or numb for extended periods
- User describes losing interest or pleasure in activities they used to enjoy
- User reports persistent fatigue, low energy, or difficulty getting through the day
- User expresses feelings of worthlessness or excessive guilt
- User mentions sleep or appetite changes alongside low mood

## Probing Questions

Surface these NATURALLY across multiple turns. Never ask more than one probing question per response. Weave them into empathetic dialogue.

1. **Onset/Duration**: "How long have you been feeling this way?" or "When did you first notice things shifting?"
   - Gathers: timeline, whether acute or chronic
2. **Frequency**: "Is this something you feel most days, or does it come and go?"
   - Gathers: pattern, episodic vs persistent
3. **Functional impact**: "How has this been affecting your day-to-day life — work, relationships, things you normally do?"
   - Gathers: impairment level, domains affected
4. **Anhedonia**: "Are there things that used to bring you joy that don't feel the same anymore?"
   - Gathers: pleasure loss, scope of disengagement
5. **Sleep/appetite**: "Has your sleep or appetite changed at all lately?"
   - Gathers: neurovegetative symptoms
6. **Protective factors**: "What's been helping you get through — even a little?"
   - Gathers: coping strategies, support network, resilience
7. **Severity**: "On your hardest days, how bad does it get?"
   - Gathers: severity floor, risk indication

## Evidence Checklist

Before the internal formulation is considered sufficiently grounded:

- [ ] Duration established (days, weeks, months)
- [ ] Frequency pattern known (daily, episodic, situational)
- [ ] At least one functional impact domain identified
- [ ] Presence or absence of anhedonia explored
- [ ] At least one protective factor or coping strategy identified
- [ ] Severity of worst episodes assessed

## Internal Formulation Template

For internal tracking only. NEVER shown to the user. NEVER use diagnostic labels.

```json
{
  "presentation": "persistent low mood",
  "features": ["anhedonia", "fatigue", "sleep disturbance", "appetite change", "worthlessness"],
  "duration": "approximate timeframe",
  "frequency": "daily | most days | episodic",
  "functional_impact": ["work", "relationships", "self-care", "social"],
  "severity": "mild | moderate | significant",
  "protective_factors": ["noted strengths or supports"],
  "evidence_confidence": 0.0,
  "gaps": ["areas still unexplored"]
}
```

## Safety Triggers

Escalate immediately to crisis protocol if during probing the user:

- Expresses suicidal ideation, wishes to die, or thoughts of self-harm
- Describes a plan or means for ending their life
- Reports feeling like a burden to others in a hopeless context
- Mentions previous suicide attempts
- Says they see no reason to continue living
