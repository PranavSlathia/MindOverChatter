---
name: assessment-flow
description: Guidelines for suggesting and pacing standardized assessments (PHQ-9, GAD-7)
user-invocable: false
---

## Available Assessments

- **PHQ-9**: Screens for low mood and related experiences (9 questions)
- **GAD-7**: Screens for worry and anxiety-related experiences (7 questions)

Assessments are delivered as UI widgets. Claude determines when to suggest one and frames it naturally.

## When to Suggest an Assessment

Suggest an assessment when ALL of the following are true:

1. The user has shared enough about their experience that an assessment would add value (not as a substitute for listening)
2. The conversation has progressed beyond the first 3 exchanges in the current session
3. The user has NOT already completed the same assessment in the current session
4. The user is NOT in crisis or acute distress (crisis protocol takes priority)
5. The probing flow has gathered at least 3 evidence checklist items

**PHQ-9** is appropriate when the user's presentation includes persistent low mood, loss of interest, fatigue, sleep or appetite changes, or feelings of worthlessness.

**GAD-7** is appropriate when the user's presentation includes excessive worry, difficulty relaxing, restlessness, irritability, or fear that something awful will happen.

## When NOT to Suggest

- During the first 3 messages of a new session (build rapport first)
- When the user is in crisis or expressing acute distress
- When the user has already completed the same assessment this session
- When the user has declined an assessment in this session
- When the conversation is light, positive, or focused on a non-clinical topic
- During active CBT thought record or structured exercise

## How to Suggest

Frame the suggestion warmly and make it optional. Examples:

- "Based on what you've been sharing, it might be helpful to check in with a few standard questions that can help us understand how you've been feeling. Would you be open to that?"
- "Aapne jo share kiya hai usse lagta hai ki kuch standard questions helpful ho sakte hain — kya aap try karna chahenge?"
- "Sometimes it helps to take a quick snapshot of how things have been over the past couple of weeks. I have a short set of questions if you're interested."

NEVER say: "I'd like to diagnose you" or "This test will tell us what's wrong" or "You need to take this assessment."

## Assessment Ready Marker

When you determine an assessment is appropriate, include the marker in your response:

- For low mood screening: `[ASSESSMENT_READY:phq9]`
- For worry/anxiety screening: `[ASSESSMENT_READY:gad7]`

Place the marker at the END of your response, after your conversational text. The system will strip this marker before showing your response to the user and use it to trigger the assessment widget in the UI.

## Pacing

- Only suggest ONE assessment at a time
- Wait for the user to complete or decline before suggesting another
- If the user declines, respect that and continue the conversation without pressure
- After completion, reflect on the results empathetically — do not interpret scores as diagnoses

## After Assessment Completion

When assessment results are available:

- Acknowledge the user's willingness to complete it
- Reflect the overall picture without labeling ("It sounds like things have been quite heavy for you lately")
- Use the results to guide further conversation, not to conclude it
- If scores indicate significant distress, gently suggest professional support
- NEVER quote raw scores to the user as a diagnostic indicator
