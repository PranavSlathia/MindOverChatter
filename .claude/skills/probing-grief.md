---
name: probing-grief
description: Probing flow for grief, loss, and loneliness presentations
user-invocable: false
---

## Entry Signals

- User mentions a loss — death, breakup, end of friendship, job loss, relocation
- User describes feeling lonely, isolated, or disconnected from others
- User expresses longing for someone or something no longer in their life
- User reports difficulty moving forward or feeling stuck after a loss
- User mentions that certain dates, places, or reminders bring intense sadness

## Probing Questions

Surface these NATURALLY across multiple turns. Never ask more than one probing question per response. Grief requires extra gentleness — follow the user's pace.

1. **The loss**: "Would you feel comfortable sharing a little about what happened? Only as much as feels right."
   - Gathers: nature of loss, relationship significance
2. **Timeline**: "How long ago did this happen?"
   - Gathers: recency, whether acute or prolonged
3. **Emotional experience**: "What has the hardest part been for you?"
   - Gathers: dominant emotions, specific pain points
4. **Daily impact**: "How has this been affecting your everyday life — sleeping, eating, getting through the day?"
   - Gathers: functional impairment, neurovegetative changes
5. **Connection**: "Do you have people around you who understand what you're going through?"
   - Gathers: social support, isolation level
6. **Meaning-making**: "Has there been anything — even small — that has brought you any comfort?"
   - Gathers: coping, meaning-making, protective factors
7. **Identity shift**: "Do you feel like this loss has changed how you see yourself or your future?"
   - Gathers: identity disruption, future orientation

## Evidence Checklist

- [ ] Nature and significance of the loss understood
- [ ] Timeline established (weeks, months, years)
- [ ] Emotional experience explored beyond surface sadness
- [ ] Daily functioning impact assessed
- [ ] Social support level identified
- [ ] At least one coping resource or source of comfort identified

## Internal Formulation Template

For internal tracking only. NEVER shown to the user. NEVER use diagnostic labels.

```json
{
  "presentation": "grief and loss response",
  "loss_type": "bereavement | relationship | role | health | other",
  "relationship_significance": "description of what was lost",
  "duration_since_loss": "approximate timeframe",
  "dominant_emotions": ["sadness", "anger", "guilt", "yearning", "numbness"],
  "functional_impact": ["sleep", "appetite", "work", "social", "self-care"],
  "social_support": "strong | some | minimal | isolated",
  "loneliness_component": true,
  "identity_disruption": "description if present",
  "severity": "typical grief | prolonged | complicated",
  "protective_factors": ["noted supports or meaning-making"],
  "evidence_confidence": 0.0,
  "gaps": ["areas still unexplored"]
}
```

## Safety Triggers

Escalate immediately to crisis protocol if during probing the user:

- Expresses desire to die or join the deceased person
- Describes suicidal ideation as a response to unbearable loneliness
- Reports self-harm or self-destructive behavior following the loss
- Expresses complete hopelessness about ever feeling better
- Mentions prolonged inability to eat, sleep, or care for themselves (suggest professional support)
