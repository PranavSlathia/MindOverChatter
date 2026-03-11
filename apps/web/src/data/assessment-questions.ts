// ── Standardized Assessment Instruments ────────────────────────────
// Static question data for validated psychological screening tools.
// These are standardized instruments — question text must not be altered.

import type { AssessmentType } from "@moc/shared";

export type AssessmentCategory = "mood_anxiety" | "wellbeing" | "personality" | "specialized";

export interface AssessmentDefinition {
  type: AssessmentType;
  name: string;
  description: string;
  preamble: string;
  /** Optional gate question shown before the main items. If answered "no" (value 0), assessment is skipped. */
  gateQuestion?: { text: string; options: Array<{ label: string; value: number }> };
  questions: string[];
  options: Array<{ label: string; value: number }>;
  category: AssessmentCategory;
  estimatedMinutes: number;
  deprecated?: boolean;
}

export const CATEGORY_LABELS: Record<AssessmentCategory, string> = {
  mood_anxiety: "Mood & Anxiety",
  wellbeing: "Wellbeing",
  personality: "Personality",
  specialized: "Specialized",
};

// ── Option Scale Presets ──────────────────────────────────────────

const LIKERT_0_3 = [
  { label: "Not at all", value: 0 },
  { label: "Several days", value: 1 },
  { label: "More than half the days", value: 2 },
  { label: "Nearly every day", value: 3 },
] as const;

const DASS_0_3 = [
  { label: "Did not apply to me at all", value: 0 },
  { label: "Applied to me to some degree", value: 1 },
  { label: "Applied to me a considerable degree", value: 2 },
  { label: "Applied to me very much", value: 3 },
] as const;

const ROSENBERG_0_3 = [
  { label: "Strongly agree", value: 3 },
  { label: "Agree", value: 2 },
  { label: "Disagree", value: 1 },
  { label: "Strongly disagree", value: 0 },
] as const;

const WHO5_0_5 = [
  { label: "At no time", value: 0 },
  { label: "Some of the time", value: 1 },
  { label: "Less than half the time", value: 2 },
  { label: "More than half the time", value: 3 },
  { label: "Most of the time", value: 4 },
  { label: "All of the time", value: 5 },
] as const;

const YES_NO = [
  { label: "No", value: 0 },
  { label: "Yes", value: 1 },
] as const;

const IPIP_1_5 = [
  { label: "Very inaccurate", value: 1 },
  { label: "Moderately inaccurate", value: 2 },
  { label: "Neither accurate nor inaccurate", value: 3 },
  { label: "Moderately accurate", value: 4 },
  { label: "Very accurate", value: 5 },
] as const;

const UCLA_1_4 = [
  { label: "Never", value: 1 },
  { label: "Rarely", value: 2 },
  { label: "Sometimes", value: 3 },
  { label: "Often", value: 4 },
] as const;

const COPENHAGEN_0_4 = [
  { label: "Never / Almost never", value: 0 },
  { label: "Seldom", value: 1 },
  { label: "Sometimes", value: 2 },
  { label: "Often", value: 3 },
  { label: "Always", value: 4 },
] as const;

const ISI_0_4 = [
  { label: "None", value: 0 },
  { label: "Mild", value: 1 },
  { label: "Moderate", value: 2 },
  { label: "Severe", value: 3 },
  { label: "Very severe", value: 4 },
] as const;

const HARROWER_0_2 = [
  { label: "Response A", value: 0 },
  { label: "Response B", value: 1 },
  { label: "Response C", value: 2 },
] as const;

const PSS_0_4 = [
  { label: "Never", value: 0 },
  { label: "Almost never", value: 1 },
  { label: "Sometimes", value: 2 },
  { label: "Fairly often", value: 3 },
  { label: "Very often", value: 4 },
] as const;

const MSPSS_1_7 = [
  { label: "Very strongly disagree", value: 1 },
  { label: "Strongly disagree", value: 2 },
  { label: "Mildly disagree", value: 3 },
  { label: "Neutral", value: 4 },
  { label: "Mildly agree", value: 5 },
  { label: "Strongly agree", value: 6 },
  { label: "Very strongly agree", value: 7 },
] as const;

const ECR_1_7 = [
  { label: "Strongly disagree", value: 1 },
  { label: "Disagree", value: 2 },
  { label: "Slightly disagree", value: 3 },
  { label: "Neutral", value: 4 },
  { label: "Slightly agree", value: 5 },
  { label: "Agree", value: 6 },
  { label: "Strongly agree", value: 7 },
] as const;

const PCL5_0_4 = [
  { label: "Not at all", value: 0 },
  { label: "A little bit", value: 1 },
  { label: "Moderately", value: 2 },
  { label: "Quite a bit", value: 3 },
  { label: "Extremely", value: 4 },
] as const;

// ── Assessment Definitions ────────────────────────────────────────

export const ASSESSMENT_DEFINITIONS: Record<string, AssessmentDefinition> = {
  // ── Mood & Anxiety ─────────────────────────────────────────────
  phq9: {
    type: "phq9",
    name: "PHQ-9",
    description: "Patient Health Questionnaire — screens for depression symptoms",
    preamble: "Over the last 2 weeks, how often have you been bothered by...",
    questions: [
      "Little interest or pleasure in doing things",
      "Feeling down, depressed, or hopeless",
      "Trouble falling or staying asleep, or sleeping too much",
      "Feeling tired or having little energy",
      "Poor appetite or overeating",
      "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
      "Trouble concentrating on things, such as reading the newspaper or watching television",
      "Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual",
      "Thoughts that you would be better off dead or of hurting yourself in some way",
    ],
    options: [...LIKERT_0_3],
    category: "mood_anxiety",
    estimatedMinutes: 3,
  },

  gad7: {
    type: "gad7",
    name: "GAD-7",
    description: "Generalized Anxiety Disorder Assessment — screens for anxiety",
    preamble: "Over the last 2 weeks, how often have you been bothered by...",
    questions: [
      "Feeling nervous, anxious, or on edge",
      "Not being able to stop or control worrying",
      "Worrying too much about different things",
      "Trouble relaxing",
      "Being so restless that it is hard to sit still",
      "Becoming easily annoyed or irritable",
      "Feeling afraid as if something awful might happen",
    ],
    options: [...LIKERT_0_3],
    category: "mood_anxiety",
    estimatedMinutes: 2,
  },

  dass21: {
    type: "dass21",
    name: "DASS-21",
    description: "Depression, Anxiety and Stress Scales — measures three related states",
    preamble: "Please read each statement and select how much it applied to you over the past week...",
    questions: [
      "I found it hard to wind down",
      "I was aware of dryness of my mouth",
      "I couldn't seem to experience any positive feeling at all",
      "I experienced breathing difficulty (e.g., excessively rapid breathing, breathlessness in the absence of physical exertion)",
      "I found it difficult to work up the initiative to do things",
      "I tended to over-react to situations",
      "I experienced trembling (e.g., in the hands)",
      "I felt that I was using a lot of nervous energy",
      "I was worried about situations in which I might panic and make a fool of myself",
      "I felt that I had nothing to look forward to",
      "I found myself getting agitated",
      "I found it difficult to relax",
      "I felt down-hearted and blue",
      "I was intolerant of anything that kept me from getting on with what I was doing",
      "I felt I was close to panic",
      "I was unable to become enthusiastic about anything",
      "I felt I wasn't worth much as a person",
      "I felt that I was rather touchy",
      "I was aware of the action of my heart in the absence of physical exertion (e.g., sense of heart rate increase, heart missing a beat)",
      "I felt scared without any good reason",
      "I felt that life was meaningless",
    ],
    options: [...DASS_0_3],
    category: "mood_anxiety",
    estimatedMinutes: 5,
  },

  phq4: {
    type: "phq4",
    name: "PHQ-4",
    description: "Ultra-brief screener for depression and anxiety",
    preamble: "Over the last 2 weeks, how often have you been bothered by...",
    questions: [
      "Feeling nervous, anxious or on edge",
      "Not being able to stop or control worrying",
      "Little interest or pleasure in doing things",
      "Feeling down, depressed, or hopeless",
    ],
    options: [...LIKERT_0_3],
    category: "mood_anxiety",
    estimatedMinutes: 1,
  },

  // ── Wellbeing ──────────────────────────────────────────────────

  who5: {
    type: "who5",
    name: "WHO-5",
    description: "World Health Organization Well-Being Index — measures positive wellbeing",
    preamble: "Over the last 2 weeks...",
    questions: [
      "I have felt cheerful and in good spirits",
      "I have felt calm and relaxed",
      "I have felt active and vigorous",
      "I woke up feeling fresh and rested",
      "My daily life has been filled with things that interest me",
    ],
    options: [...WHO5_0_5],
    category: "wellbeing",
    estimatedMinutes: 1,
  },

  rosenberg_se: {
    type: "rosenberg_se",
    name: "Rosenberg Self-Esteem",
    description: "Rosenberg Self-Esteem Scale — measures global self-worth",
    preamble: "Please indicate how strongly you agree or disagree with each statement...",
    questions: [
      "On the whole, I am satisfied with myself",
      "At times I think I am no good at all",
      "I feel that I have a number of good qualities",
      "I am able to do things as well as most other people",
      "I feel I do not have much to be proud of",
      "I certainly feel useless at times",
      "I feel that I'm a person of worth, at least on an equal plane with others",
      "I wish I could have more respect for myself",
      "All in all, I am inclined to feel that I am a failure",
      "I take a positive attitude toward myself",
    ],
    options: [...ROSENBERG_0_3],
    category: "wellbeing",
    estimatedMinutes: 2,
  },

  pss: {
    type: "pss",
    name: "PSS-10",
    description: "Perceived Stress Scale — reflects how overloaded or in-control life has felt recently",
    preamble: "The questions in this scale ask you about your feelings and thoughts during the last month...",
    questions: [
      "In the last month, how often have you been upset because of something that happened unexpectedly?",
      "In the last month, how often have you felt that you were unable to control the important things in your life?",
      "In the last month, how often have you felt nervous and stressed?",
      "In the last month, how often have you felt confident about your ability to handle your personal problems?",
      "In the last month, how often have you felt that things were going your way?",
      "In the last month, how often have you found that you could not cope with all the things that you had to do?",
      "In the last month, how often have you been able to control irritations in your life?",
      "In the last month, how often have you felt that you were on top of things?",
      "In the last month, how often have you been angered because of things that were outside of your control?",
      "In the last month, how often have you felt difficulties were piling up so high that you could not overcome them?",
    ],
    options: [...PSS_0_4],
    category: "wellbeing",
    estimatedMinutes: 3,
  },

  mspss: {
    type: "mspss",
    name: "MSPSS",
    description: "Multidimensional Scale of Perceived Social Support — explores how supported you feel by key people",
    preamble: "Please indicate how strongly you agree or disagree with each statement...",
    questions: [
      "There is a special person who is around when I am in need.",
      "There is a special person with whom I can share my joys and sorrows.",
      "My family really tries to help me.",
      "I get the emotional help and support I need from my family.",
      "I have a special person who is a real source of comfort to me.",
      "My friends really try to help me.",
      "I can count on my friends when things go wrong.",
      "I can talk about my problems with my family.",
      "I have friends with whom I can share my joys and sorrows.",
      "There is a special person in my life who cares about my feelings.",
      "My family is willing to help me make decisions.",
      "I can talk about my problems with my friends.",
    ],
    options: [...MSPSS_1_7],
    category: "wellbeing",
    estimatedMinutes: 3,
  },

  // ── Personality ────────────────────────────────────────────────

  ipip_big5: {
    type: "ipip_big5",
    name: "Big Five Personality",
    description: "IPIP 50-item inventory — explores your personality traits (not a diagnosis)",
    preamble: "Describe yourself as you generally are now, not as you wish to be. Select how accurately each statement describes you...",
    questions: [
      // E1, A1, C1, N1, O1 — items 1-5
      "Am the life of the party",
      "Feel little concern for others",
      "Am always prepared",
      "Get stressed out easily",
      "Have a rich vocabulary",
      // E2, A2, C2, N2, O2 — items 6-10
      "Don't talk a lot",
      "Am interested in people",
      "Leave my belongings around",
      "Am relaxed most of the time",
      "Have difficulty understanding abstract ideas",
      // E3, A3, C3, N3, O3 — items 11-15
      "Feel comfortable around people",
      "Insult people",
      "Pay attention to details",
      "Worry about things",
      "Have a vivid imagination",
      // E4, A4, C4, N4, O4 — items 16-20
      "Keep in the background",
      "Sympathize with others' feelings",
      "Make a mess of things",
      "Seldom feel blue",
      "Am not interested in abstract ideas",
      // E5, A5, C5, N5, O5 — items 21-25
      "Start conversations",
      "Am not interested in other people's problems",
      "Get chores done right away",
      "Am easily disturbed",
      "Have excellent ideas",
      // E6, A6, C6, N6, O6 — items 26-30
      "Have little to say",
      "Have a soft heart",
      "Often forget to put things back in their proper place",
      "Get upset easily",
      "Do not have a good imagination",
      // E7, A7, C7, N7, O7 — items 31-35
      "Talk to a lot of different people at parties",
      "Am not really interested in others",
      "Like order",
      "Change my mood a lot",
      "Am quick to understand things",
      // E8, A8, C8, N8, O8 — items 36-40
      "Don't like to draw attention to myself",
      "Take time out for others",
      "Shirk my duties",
      "Have frequent mood swings",
      "Use difficult words",
      // E9, A9, C9, N9, O9 — items 41-45
      "Don't mind being the center of attention",
      "Feel others' emotions",
      "Follow a schedule",
      "Get irritated easily",
      "Spend time reflecting on things",
      // E10, A10, C10, N10, O10 — items 46-50
      "Am quiet around strangers",
      "Make people feel at ease",
      "Am exacting in my work",
      "Often feel blue",
      "Am full of ideas",
    ],
    options: [...IPIP_1_5],
    category: "personality",
    estimatedMinutes: 10,
  },

  ecr: {
    type: "ecr",
    name: "ECR-36",
    description: "Experiences in Close Relationships — explores attachment-related patterns in close relationships",
    preamble: "We are interested in how you generally experience close relationships, not just what is happening in a current relationship. Please indicate how much you agree or disagree with each statement...",
    questions: [
      "I'm somewhat uncomfortable being close to others.",
      "I worry about being abandoned.",
      "I am very comfortable being close to others.",
      "I worry a lot about my relationships.",
      "Just when my partner starts to get close to me, I find myself pulling away.",
      "I worry that romantic partners won't care about me as much as I care about them.",
      "I get uncomfortable when a romantic partner wants to be very close.",
      "I worry a fair amount about losing my partner.",
      "I don't feel comfortable opening up to romantic partners.",
      "I often wish that my partner's feelings for me were as strong as my feelings for him or her.",
      "I want to merge completely with another person.",
      "I often worry that my partner will not want to stay with me.",
      "I am nervous when partners get too close to me.",
      "I often worry that my partner doesn't really love me.",
      "I feel comfortable depending on romantic partners.",
      "I worry that I will be alone.",
      "I know that romantic partners will be there when I need them.",
      "My desire to be very close sometimes scares people away.",
      "It helps to turn to my romantic partner in times of need.",
      "I worry that I do not measure up to other people.",
      "I find it relatively easy to get close to my partner.",
      "My romantic partner makes me doubt myself.",
      "I do not often worry about being abandoned.",
      "I find that my partner(s) don't want to get as close as I would like.",
      "I usually discuss my problems and concerns with my partner.",
      "When I am not involved in a relationship, I feel somewhat anxious and insecure.",
      "I find it easy to depend on romantic partners.",
      "I feel that my partner does not want to get as close as I would like.",
      "I tell my partner just about everything.",
      "I rarely worry about my partner leaving me.",
      "I talk things over with my partner.",
      "I find it difficult to allow myself to depend on romantic partners.",
      "I am nervous when my partner gets too close to me.",
      "My partner really understands me and my needs.",
      "It's easy for me to be affectionate with my partner.",
      "I resent it when my partner spends time away from me.",
    ],
    options: [...ECR_1_7],
    category: "personality",
    estimatedMinutes: 10,
  },

  harrower_inkblot: {
    type: "harrower_inkblot",
    name: "Harrower Inkblot",
    description: "Harrower-Erickson Multiple Choice Rorschach — a creative personality exercise",
    preamble: "For each inkblot card, select the response that best matches what you see...",
    questions: [
      "Card I: What do you see?",
      "Card II: What do you see?",
      "Card III: What do you see?",
      "Card IV: What do you see?",
      "Card V: What do you see?",
      "Card VI: What do you see?",
      "Card VII: What do you see?",
      "Card VIII: What do you see?",
      "Card IX: What do you see?",
      "Card X: What do you see?",
    ],
    options: [...HARROWER_0_2],
    category: "personality",
    estimatedMinutes: 5,
    deprecated: true,
  },

  // ── Specialized ────────────────────────────────────────────────

  pc_ptsd5: {
    type: "pc_ptsd5",
    name: "PC-PTSD-5",
    description: "Primary Care PTSD Screen — screens for trauma-related symptoms",
    preamble: "Answering about the past month...",
    gateQuestion: {
      text: "Sometimes things happen to people that are unusually or especially frightening, horrible, or traumatic. In your life, have you ever experienced this type of event?",
      options: [{ label: "No", value: 0 }, { label: "Yes", value: 1 }],
    },
    questions: [
      "Had nightmares about the event(s) or thought about the event(s) when you did not want to?",
      "Tried hard not to think about the event(s) or went out of your way to avoid situations that reminded you of the event(s)?",
      "Been constantly on guard, watchful, or easily startled?",
      "Felt numb or detached from people, activities, or your surroundings?",
      "Felt guilty or unable to stop blaming yourself or others for the event(s) or any problems the event(s) may have caused?",
    ],
    options: [...YES_NO],
    category: "specialized",
    estimatedMinutes: 2,
  },

  pcl5: {
    type: "pcl5",
    name: "PCL-5",
    description: "PTSD Checklist for DSM-5 — checks for trauma-related symptoms over the past month",
    preamble: "Thinking about the most stressful experience that still affects you, how much have you been bothered by each of the following problems in the past month?",
    questions: [
      "Repeated, disturbing, and unwanted memories of the stressful experience",
      "Repeated, disturbing dreams of the stressful experience",
      "Suddenly feeling or acting as if the stressful experience were actually happening again",
      "Feeling very upset when something reminded you of the stressful experience",
      "Having strong physical reactions when something reminded you of the stressful experience",
      "Avoiding memories, thoughts, or feelings related to the stressful experience",
      "Avoiding external reminders of the stressful experience",
      "Trouble remembering important parts of the stressful experience",
      "Having strong negative beliefs about yourself, other people, or the world",
      "Blaming yourself or someone else for the stressful experience or what happened after it",
      "Having strong negative feelings such as fear, horror, anger, guilt, or shame",
      "Loss of interest in activities that you used to enjoy",
      "Feeling distant or cut off from other people",
      "Trouble experiencing positive feelings",
      "Irritable behavior, angry outbursts, or acting aggressively",
      "Taking too many risks or doing things that could cause you harm",
      "Being superalert or watchful or on guard",
      "Feeling jumpy or easily startled",
      "Having difficulty concentrating",
      "Trouble falling or staying asleep",
    ],
    options: [...PCL5_0_4],
    category: "specialized",
    estimatedMinutes: 5,
  },

  ucla_loneliness: {
    type: "ucla_loneliness",
    name: "UCLA Loneliness",
    description: "UCLA Loneliness Scale v3 — measures feelings of social isolation",
    preamble: "Indicate how often you feel the way described in each statement...",
    questions: [
      "I feel in tune with the people around me",
      "I lack companionship",
      "There is no one I can turn to",
      "I do not feel alone",
      "I feel part of a group of friends",
      "I have a lot in common with the people around me",
      "I am no longer close to anyone",
      "My interests and ideas are not shared by those around me",
      "I am an outgoing person",
      "There are people I feel close to",
      "I feel left out",
      "My social relationships are superficial",
      "No one really knows me well",
      "I feel isolated from others",
      "I can find companionship when I want it",
      "There are people who really understand me",
      "I am unhappy being so withdrawn",
      "People are around me but not with me",
      "There are people I can talk to",
      "There are people I can turn to",
    ],
    options: [...UCLA_1_4],
    category: "specialized",
    estimatedMinutes: 5,
  },

  copenhagen_burnout: {
    type: "copenhagen_burnout",
    name: "Copenhagen Burnout",
    description: "Copenhagen Burnout Inventory — measures personal, work and client burnout",
    preamble: "Please indicate how often the following statements apply to you...",
    questions: [
      // Personal burnout (items 1-6)
      "How often do you feel tired?",
      "How often are you physically exhausted?",
      "How often are you emotionally exhausted?",
      "How often do you think: 'I can't take it anymore'?",
      "How often do you feel worn out?",
      "How often do you feel weak and susceptible to illness?",
      // Work-related burnout (items 7-13)
      "Is your work emotionally exhausting?",
      "Do you feel burnt out because of your work?",
      "Does your work frustrate you?",
      "Do you feel worn out at the end of the working day?",
      "Are you exhausted in the morning at the thought of another day at work?",
      "Do you feel that every working hour is tiring for you?",
      "Do you have enough energy for family and friends during leisure time?",
      // Client-related burnout (items 14-19)
      "Do you find it hard to work with clients?",
      "Does it drain your energy to work with clients?",
      "Do you find it frustrating to work with clients?",
      "Do you feel that you give more than you get back when you work with clients?",
      "Are you tired of working with clients?",
      "Do you sometimes wonder how long you will be able to continue working with clients?",
    ],
    options: [...COPENHAGEN_0_4],
    category: "specialized",
    estimatedMinutes: 5,
  },

  ace_iq: {
    type: "ace_iq",
    name: "ACE-IQ",
    description: "ACE International Questionnaire — a broader reflection on early adversity and safety",
    preamble: "Before your 18th birthday, did any of the following experiences happen to you? Take your time and answer yes or no.",
    questions: [
      "Did a parent, guardian, or other adult in your home often insult, humiliate, or put you down?",
      "Did a parent, guardian, or other adult in your home often hit, beat, kick, or physically hurt you?",
      "Did anyone ever touch you sexually, make you touch them sexually, or force sexual acts on you?",
      "Did you often feel that no one in your family loved you, supported you, or thought you were important?",
      "Did you often not have enough food, clean clothes, medical care, or a safe place to stay?",
      "Did you often see or hear a parent or household member being yelled at, slapped, hit, or threatened?",
      "Did you live with anyone who was a problem drinker or used street drugs?",
      "Did you live with anyone who was depressed, mentally ill, or who attempted suicide?",
      "Did a household member ever go to prison?",
      "Were your parents or guardians separated, divorced, or did one of them die?",
      "Were you often bullied, picked on, or threatened by other children?",
      "Did you ever see or hear someone in your community being beaten, stabbed, or shot in real life?",
      "Did you ever experience war, terrorism, kidnapping, or being forced to flee your home or community?",
    ],
    options: [...YES_NO],
    category: "specialized",
    estimatedMinutes: 4,
  },

  ace_score: {
    type: "ace_score",
    name: "ACE Score",
    description: "Adverse Childhood Experiences — a gentle look at early life experiences",
    deprecated: true,
    preamble: "Before your 18th birthday, did any of the following occur? Take your time — there's no rush.",
    questions: [
      "Did a parent or other adult in the household often swear at you, insult you, put you down, or humiliate you?",
      "Did a parent or other adult in the household often push, grab, slap, or throw something at you?",
      "Did an adult or person at least 5 years older ever touch you sexually or have you touch their body sexually?",
      "Did you often feel that no one in your family loved you or thought you were important or special?",
      "Did you often feel that you didn't have enough to eat, had to wear dirty clothes, or had no one to protect you?",
      "Were your parents ever separated or divorced?",
      "Was your mother or stepmother often pushed, grabbed, slapped, or had something thrown at her?",
      "Did you live with anyone who was a problem drinker or alcoholic, or who used street drugs?",
      "Was a household member depressed or mentally ill, or did a household member attempt suicide?",
      "Did a household member go to prison?",
    ],
    options: [...YES_NO],
    category: "specialized",
    estimatedMinutes: 3,
  },

  isi: {
    type: "isi",
    name: "ISI",
    description: "Insomnia Severity Index — measures the nature and severity of insomnia",
    preamble: "Please rate the current (i.e., last 2 weeks) severity of your insomnia problem(s)...",
    questions: [
      "Difficulty falling asleep",
      "Difficulty staying asleep",
      "Problem waking up too early",
      "How satisfied/dissatisfied are you with your current sleep pattern?",
      "How noticeable to others do you think your sleep problem is in terms of impairing the quality of your life?",
      "How worried/distressed are you about your current sleep problem?",
      "To what extent do you consider your sleep problem to interfere with your daily functioning?",
    ],
    options: [...ISI_0_4],
    category: "specialized",
    estimatedMinutes: 2,
  },
};

/**
 * Look up an assessment definition by type string.
 * Returns undefined for unknown types (e.g., screeners not yet defined in the UI).
 */
export function getAssessmentDefinition(type: string): AssessmentDefinition | undefined {
  return ASSESSMENT_DEFINITIONS[type];
}

/** Get all definitions grouped by category, in display order. */
export function getAssessmentsByCategory(): Array<{
  category: AssessmentCategory;
  label: string;
  assessments: AssessmentDefinition[];
}> {
  const groups: Record<AssessmentCategory, AssessmentDefinition[]> = {
    mood_anxiety: [],
    wellbeing: [],
    personality: [],
    specialized: [],
  };

  for (const def of Object.values(ASSESSMENT_DEFINITIONS)) {
    if (def.deprecated) continue;
    groups[def.category].push(def);
  }

  const order: AssessmentCategory[] = ["mood_anxiety", "wellbeing", "personality", "specialized"];
  return order
    .filter((cat) => groups[cat].length > 0)
    .map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat],
      assessments: groups[cat],
    }));
}
