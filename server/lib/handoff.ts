// Handoff generation for receptionist/clinician view
// Generates structured one-page clinical handoff from chat session

import { openai } from "../replit_integrations/image/client";
import { evaluateTriage } from "./rules";
import { retrieveRelevantChunks } from "./rag";
import { storage } from "../storage";
import type { ChatState, ChatMessage } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";

// Load red flag rules
const redFlagRulesPath = path.join(__dirname, "redFlagRules.json");
const redFlagRules = JSON.parse(fs.readFileSync(redFlagRulesPath, "utf-8"));

// Reliability: confidence thresholds (higher = less hallucination risk).
// Tune CONFIDENCE_CRITICAL (default 70) if you want stricter LLM fact acceptance for red-flag–related fields.
const CONFIDENCE_CRITICAL = 70;  // required for facts that drive red flags / severity
const CONFIDENCE_DEFAULT = 50;   // for non-critical facts

// Facts in this list require CONFIDENCE_CRITICAL and (when not boolean) must be present in conversation text.
const CRITICAL_FACT_KEYS = [
  "severity_score", "chest_pain", "shortness_of_breath", "collapse", "confusion",
  "severe_bleeding", "fainting", "face_droop", "arm_weakness", "speech_difficulty",
  "thunderclap", "neck_stiffness", "non_blanching_rash", "vomiting_blood", "pregnant_possible", "fever"
];

// Map chat state (camelCase) to fact keys used by red-flag rules (snake_case)
function deterministicFactsFromState(state: Record<string, any>): Record<string, any> {
  const m: Record<string, any> = {};
  if (state.age != null) m.age_years = state.age;
  if (state.sex != null) m.sex = state.sex;
  if (state.complaint != null) m.chief_complaint = state.complaint;
  if (state.openingDescription != null && !m.chief_complaint) m.chief_complaint = state.openingDescription;
  if (state.onset != null) m.onset = state.onset;
  if (state.duration != null) m.duration = state.duration;
  if (state.severity != null) m.severity_score = state.severity;
  if (state.location != null) m.location = state.location;
  if (state.shortnessOfBreath != null) m.shortness_of_breath = state.shortnessOfBreath;
  if (state.troubleBreathing != null) m.shortness_of_breath = m.shortness_of_breath ?? state.troubleBreathing;
  if (state.collapse != null) m.collapse = state.collapse;
  if (state.confusion != null) m.confusion = state.confusion;
  if (state.severeBleeding != null) m.severe_bleeding = state.severeBleeding;
  if (state.radiatingPain != null) m.radiating_pain = state.radiatingPain;
  if (state.thunderclap != null) m.thunderclap = state.thunderclap;
  if (state.neckStiffness != null) m.neck_stiffness = state.neckStiffness;
  if (state.nonBlanchingRash != null) m.non_blanching_rash = state.nonBlanchingRash;
  if (state.vomitingBlood != null) m.vomiting_blood = state.vomitingBlood;
  if (state.pregnancy != null) m.pregnant_possible = state.pregnancy;
  if (state.fever != null) m.fever = state.fever;
  return m;
}

function foundInConversation(conversationText: string, value: unknown): boolean {
  const text = conversationText.toLowerCase();
  if (typeof value === "boolean") return true; // no cheap substring check for yes/no
  if (typeof value === "number") return text.includes(String(value)) || (value <= 10 && /\d{1,2}\s*\/\s*10|\b\d{1,2}\b/.test(text));
  if (typeof value === "string") return text.includes(value.toLowerCase().trim());
  return false;
}

function logExtractionDivergence(key: string, llmValue: unknown, stateValue: unknown, sessionId?: number): void {
  if (process.env.NODE_ENV === "development" || process.env.LOG_EXTRACTION_DIVERGENCE === "1") {
    const ctx = sessionId != null ? `session=${sessionId} ` : "";
    console.warn(`[handoff] ${ctx}extraction_divergence key=${key} llm=${JSON.stringify(llmValue)} state=${JSON.stringify(stateValue)}`);
  }
}

// Handoff JSON Schema Types
export interface HandoffJson {
  presenting_complaint: {
    chief_complaint: string;
    onset: string;
    duration: string;
    severity: string;
    location: string;
    associated_symptoms: string[];
  };
  key_positives: string[];
  key_negatives: string[];
  red_flags: {
    triggered: Array<{ flag: string; evidence: string }>;
    not_triggered: string[];
    not_assessed: string[];
  };
  severity: {
    rules_engine_category: "GREEN" | "AMBER" | "RED";
    ai_suggested_category: "GREEN" | "AMBER" | "RED";
    ai_confidence: "LOW" | "MEDIUM" | "HIGH";
    rationale: string;
  };
  differentials: Array<{
    condition: string;
    why_consider: string;
    supporting_features: string[];
  }>;
  consultation_focus: {
    questions_to_confirm: string[];
    exam_checks: string[];
    immediate_actions: string[];
    safety_net: string;
  };
  summary_for_reception: string;
}

// Facts extraction prompt
const FACTS_EXTRACTION_PROMPT = `You extract structured facts from patient text for clinical assistant intake.

Rules:
- Do not diagnose.
- Only extract facts explicitly stated or strongly implied by the patient. Do not invent or infer facts that are not supported by the conversation.
- If a value is unknown, do not guess—omit it or use a confidence of 0.
- Use boolean true/false where appropriate.
- Provide a confidence score per fact (0-100).

Return JSON only:
{
  "facts": [
    {"key":"", "value":{}, "confidence":0}
  ],
  "negations": [
    {"key":"", "value":{}, "confidence":0}
  ]
}

Fact keys to consider include:
chief_complaint, onset, duration, progression, severity_score, location, associated_symptoms,
chest_pain, shortness_of_breath, fever, vomiting, bleeding, fainting,
face_droop, arm_weakness, speech_difficulty,
pregnant_possible, age_years, allergies, current_meds, relevant_history`;

// Handoff generation prompt
const HANDOFF_GENERATION_PROMPT = `You generate a structured clinical handoff for a receptionist or clinician.

You must:
- Not diagnose.
- Only include information that appears in the provided presenting complaint facts and conversation; do not invent details, dates, or symptoms.
- Present possible causes only as "differentials" and clearly non-diagnostic.
- Highlight what was not assessed.
- Keep it concise and clinically useful.
- Use the provided rules_engine_category as the primary severity category. AI suggested category is secondary.

Return JSON only exactly matching this schema:
{
  "presenting_complaint": {
    "chief_complaint": "",
    "onset": "",
    "duration": "",
    "severity": "",
    "location": "",
    "associated_symptoms": []
  },
  "key_positives": [],
  "key_negatives": [],
  "red_flags": {
    "triggered": [{"flag": "", "evidence": ""}],
    "not_triggered": [],
    "not_assessed": []
  },
  "severity": {
    "rules_engine_category": "GREEN",
    "ai_suggested_category": "GREEN",
    "ai_confidence": "LOW",
    "rationale": ""
  },
  "differentials": [
    {
      "condition": "",
      "why_consider": "",
      "supporting_features": []
    }
  ],
  "consultation_focus": {
    "questions_to_confirm": [],
    "exam_checks": [],
    "immediate_actions": [],
    "safety_net": ""
  },
  "summary_for_reception": ""
}`;

// Options for fact extraction (onDivergence used for metrics / hallucination tracking).
export type ExtractFactsOpts = {
  sessionId?: number;
  onDivergence?: (sessionId: number | undefined, key: string, llmValue: unknown, stateValue: unknown) => void;
};

// Extract facts from patient messages. Uses deterministic state first, then LLM with validation.
export async function extractFactsFromMessages(
  messages: ChatMessage[],
  existingFacts: Record<string, any> = {},
  opts?: ExtractFactsOpts
): Promise<Record<string, any>> {
  const patientMessages = messages
    .filter(m => m.role === "user")
    .map(m => m.content)
    .join("\n");

  const deterministic = deterministicFactsFromState(existingFacts);
  const facts: Record<string, any> = { ...existingFacts, ...deterministic };

  if (!patientMessages.trim()) {
    return facts;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: FACTS_EXTRACTION_PROMPT },
        {
          role: "user",
          content: `Extract facts from this patient conversation:\n\n${patientMessages}\n\nExisting facts: ${JSON.stringify(deterministic)}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 1000
    });

    const result = JSON.parse(response.choices[0]?.message?.content || "{}");
    const sessionId = opts?.sessionId;

    if (result.facts) {
      for (const fact of result.facts) {
        const threshold = CRITICAL_FACT_KEYS.includes(fact.key) ? CONFIDENCE_CRITICAL : CONFIDENCE_DEFAULT;
        if (fact.confidence < threshold) continue;
        const mustValidate = CRITICAL_FACT_KEYS.includes(fact.key) && typeof fact.value !== "boolean";
        if (mustValidate && !foundInConversation(patientMessages, fact.value)) continue;
        if (deterministic[fact.key] !== undefined && deterministic[fact.key] !== fact.value) {
          logExtractionDivergence(fact.key, fact.value, deterministic[fact.key], sessionId);
          opts?.onDivergence?.(sessionId, fact.key, fact.value, deterministic[fact.key]);
        }
        facts[fact.key] = fact.value;
      }
    }

    if (result.negations) {
      for (const neg of result.negations) {
        const threshold = CRITICAL_FACT_KEYS.includes(neg.key) ? CONFIDENCE_CRITICAL : CONFIDENCE_DEFAULT;
        if (neg.confidence < threshold) continue;
        facts[neg.key] = false;
      }
    }

    return facts;
  } catch (error) {
    console.error("Error extracting facts:", error);
    return facts;
  }
}

// Evaluate red flags using rules engine
export function evaluateRedFlags(facts: Record<string, any>): {
  triggered: Array<{ code: string; label: string; evidence: string }>;
  notTriggered: string[];
  notAssessed: string[];
} {
  const triggered: Array<{ code: string; label: string; evidence: string }> = [];
  const notTriggered: string[] = [];
  const notAssessed: string[] = [];

  for (const rule of redFlagRules.red_flags) {
    let matches = false;

    // Check criteria_all (all must match)
    if (rule.criteria_all) {
      matches = rule.criteria_all.every(criterion => {
        const factValue = facts[criterion.fact];
        if (criterion.op === "eq") {
          return factValue === criterion.value;
        } else if (criterion.op === "gte") {
          return typeof factValue === "number" && factValue >= criterion.value;
        } else if (criterion.op === "lte") {
          return typeof factValue === "number" && factValue <= criterion.value;
        }
        return false;
      });
    }

    // Check criteria_any (any must match)
    if (rule.criteria_any && !matches) {
      matches = rule.criteria_any.some(criterion => {
        const factValue = facts[criterion.fact];
        if (criterion.op === "eq") {
          return factValue === criterion.value;
        } else if (criterion.op === "gte") {
          return typeof factValue === "number" && factValue >= criterion.value;
        } else if (criterion.op === "lte") {
          return typeof factValue === "number" && factValue <= criterion.value;
        }
        return false;
      });
    }

    if (matches) {
      triggered.push({
        code: rule.code,
        label: rule.label,
        evidence: rule.evidence_prompt
      });
    } else {
      // Check if we have the facts to evaluate this rule
      const requiredFacts = [
        ...(rule.criteria_all || []).map(c => c.fact),
        ...(rule.criteria_any || []).map(c => c.fact)
      ];
      const hasFacts = requiredFacts.some(fact => fact in facts);
      
      if (hasFacts) {
        notTriggered.push(rule.label);
      } else {
        notAssessed.push(rule.label);
      }
    }
  }

  return { triggered, notTriggered, notAssessed };
}

// Generate handoff JSON
export async function generateHandoff(
  sessionId: number,
  state: ChatState,
  messages: ChatMessage[],
  triggeredRedFlags: Array<{ code: string; label: string; evidence: string }>,
  notTriggered: string[],
  notAssessed: string[]
): Promise<HandoffJson> {
  // Get RAG chunks for context
  const complaint = state.complaint || "";
  const answers = buildAnswersFromState(state);
  const redFlagLabels = triggeredRedFlags.map(rf => rf.label);
  
  const ragChunks = await retrieveRelevantChunks(
    complaint,
    answers,
    redFlagLabels
  );

  // Build facts JSON for prompt
  const factsJson = JSON.stringify(state, null, 2);
  const triggeredFlagsJson = JSON.stringify(triggeredRedFlags, null, 2);
  const notAssessedJson = JSON.stringify(notAssessed, null, 2);
  const ragSnippets = ragChunks.map(c => c.content).join("\n\n---\n\n");

  // Run rules engine to get severity
  const triageResult = evaluateTriage(answers);
  const rulesSeverity = triageResult.riskBand.toUpperCase() as "GREEN" | "AMBER" | "RED";

  // Generate handoff with LLM
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: HANDOFF_GENERATION_PROMPT },
        {
          role: "user",
          content: `Generate handoff JSON for this clinical assistant session.

Presenting complaint facts (JSON):
${factsJson}

Triggered red flags from rules engine (JSON):
${triggeredFlagsJson}

Not assessed items (array):
${notAssessedJson}

RAG snippets (for internal use only):
${ragSnippets}

Rules engine category: ${rulesSeverity}

Generate the complete handoff JSON following the schema exactly.`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 2000
    });

    const handoff = JSON.parse(response.choices[0]?.message?.content || "{}") as HandoffJson;

    // Ensure rules engine category is set correctly
    handoff.severity.rules_engine_category = rulesSeverity;

    // Format red flags
    handoff.red_flags.triggered = triggeredRedFlags.map(rf => ({
      flag: rf.label,
      evidence: rf.evidence
    }));
    handoff.red_flags.not_triggered = notTriggered;
    handoff.red_flags.not_assessed = notAssessed;

    return handoff;
  } catch (error) {
    console.error("Error generating handoff:", error);
    // Return minimal handoff on error
    return createMinimalHandoff(state, triageResult, triggeredRedFlags, notTriggered, notAssessed);
  }
}

// Create minimal handoff if LLM fails
function createMinimalHandoff(
  state: ChatState,
  triageResult: { riskBand: string; redFlags: string[]; summary: string },
  triggeredRedFlags: Array<{ code: string; label: string; evidence: string }>,
  notTriggered: string[],
  notAssessed: string[]
): HandoffJson {
  return {
    presenting_complaint: {
      chief_complaint: state.complaint || state.openingDescription || "Not specified",
      onset: state.onset || "Not specified",
      duration: state.duration || "Not specified",
      severity: state.severity !== undefined ? `${state.severity}/10` : "Not rated",
      location: state.location || "Not specified",
      associated_symptoms: []
    },
    key_positives: [],
    key_negatives: [],
    red_flags: {
      triggered: triggeredRedFlags.map(rf => ({ flag: rf.label, evidence: rf.evidence })),
      not_triggered: notTriggered,
      not_assessed: notAssessed
    },
    severity: {
      rules_engine_category: triageResult.riskBand.toUpperCase() as "GREEN" | "AMBER" | "RED",
      ai_suggested_category: triageResult.riskBand.toUpperCase() as "GREEN" | "AMBER" | "RED",
      ai_confidence: "LOW",
      rationale: triageResult.summary
    },
    differentials: [],
    consultation_focus: {
      questions_to_confirm: [],
      exam_checks: [],
      immediate_actions: [],
      safety_net: "If symptoms worsen, seek urgent medical attention."
    },
    summary_for_reception: triageResult.summary
  };
}

// Build answers object from chat state for rules engine
function buildAnswersFromState(state: ChatState): Record<string, any> {
  return {
    complaint: state.complaint || "",
    age: state.age || 0,
    sex: state.sex || "",
    severity: state.severity || 0,
    onset: state.onset,
    location: state.location,
    duration: state.duration,
    shortnessOfBreath: state.shortnessOfBreath || state.troubleBreathing || false,
    collapse: state.collapse || false,
    confusion: state.confusion || false,
    severeBleeding: state.severeBleeding || false,
    radiatingPain: state.radiatingPain || false,
    sweating: state.sweating || false,
    nausea: state.nausea || false,
    cardiacHistory: state.cardiacHistory || false,
    thunderclap: state.thunderclap || false,
    neckStiffness: state.neckStiffness || false,
    visualDisturbance: state.visualDisturbance || false,
    neurologicalSymptoms: state.neurologicalSymptoms || false,
    nonBlanchingRash: state.nonBlanchingRash || false,
    vomitingBlood: state.vomitingBlood || false,
    bloodyStools: state.bloodyStools || false,
    pregnancy: state.pregnancy || false,
    fever: state.fever || false,
    ...state
  };
}
