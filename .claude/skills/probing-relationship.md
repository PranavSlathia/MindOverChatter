---
name: probing-relationship
description: Probing flow for relationship conflict and interpersonal distress presentations
user-invocable: false
---

## Entry Signals

- User describes conflict with a partner, family member, friend, or colleague
- User mentions feeling misunderstood, unsupported, or dismissed by someone close
- User reports communication breakdowns or recurring arguments
- User expresses anxiety about a relationship ending or changing
- User describes feeling controlled, belittled, or emotionally unsafe in a relationship

## Probing Questions

Surface these NATURALLY across multiple turns. Never ask more than one probing question per response. Stay neutral — do not take sides.

1. **The relationship**: "Can you tell me a bit about this relationship and what it means to you?"
   - Gathers: relationship type, significance, attachment
2. **The conflict**: "What's been happening between you two? What does a typical disagreement look like?"
   - Gathers: conflict pattern, communication style
3. **Duration**: "Is this something recent, or has it been building up for a while?"
   - Gathers: timeline, chronic vs acute
4. **Emotional impact**: "How does this make you feel — during the conflict and afterward?"
   - Gathers: emotional response, residual distress
5. **Patterns**: "Do you notice any patterns — like the same argument keeps coming back in different forms?"
   - Gathers: recurring dynamics, unresolved core issues
6. **Their perspective**: "What do you think they would say is going on?"
   - Gathers: perspective-taking ability, empathy, rigidity
7. **What they want**: "If things could change, what would you want this relationship to look like?"
   - Gathers: desired outcome, motivation, readiness for change

## Evidence Checklist

- [ ] Relationship type and significance understood
- [ ] Nature of the conflict described
- [ ] Duration and pattern explored
- [ ] Emotional impact on the user assessed
- [ ] User's desired outcome or hope identified
- [ ] At least one protective factor or positive aspect of the relationship noted

## Internal Formulation Template

For internal tracking only. NEVER shown to the user. NEVER use diagnostic labels.

```json
{
  "presentation": "interpersonal distress and relationship conflict",
  "relationship_type": "romantic | family | friendship | professional",
  "conflict_pattern": "communication breakdown | recurring argument | emotional distance | control dynamics",
  "duration": "approximate timeframe",
  "emotional_impact": ["frustration", "sadness", "anxiety", "anger", "loneliness", "helplessness"],
  "functional_impact": ["mood", "sleep", "work", "other relationships", "self-esteem"],
  "user_attachment_style": "observations if apparent",
  "desired_outcome": "reconciliation | boundaries | ending | clarity",
  "severity": "mild | moderate | significant",
  "protective_factors": ["positive relationship aspects", "support network"],
  "evidence_confidence": 0.0,
  "gaps": ["areas still unexplored"]
}
```

## Safety Triggers

Escalate immediately to crisis protocol if during probing the user:

- Describes being physically harmed, threatened, or in danger from the other person
- Expresses suicidal ideation related to the relationship situation
- Reports controlling or coercive behavior that restricts their freedom or safety
- Describes self-harm as a response to relationship distress
- Indicates fear for their physical safety — provide domestic violence resources alongside crisis resources
