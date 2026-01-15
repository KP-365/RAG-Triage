// Chat State Machine for Guided Triage Interview
// Implements NHS 111-style triage following the provided prompt structure

import type { ChatState, ChatMessage } from "@shared/schema";
import { evaluateTriage } from "./rules";
import { openai } from "../replit_integrations/image/client";

export type Stage = 
  | "opening"
  | "localisation"
  | "time_start"
  | "time_trend"
  | "severity"
  | "danger_breathing"
  | "danger_collapse"
  | "danger_severe_pain"
  | "danger_bleeding"
  | "danger_confusion"
  | "red_flags"
  | "rag_followup"
  | "context_conditions"
  | "context_medications"
  | "context_surgery"
  | "functional_eat"
  | "functional_move"
  | "functional_activities"
  | "collect_name"
  | "summary"
  | "complete"
  | "escalated";

interface StageConfig {
  question: string;
  extract: (input: string, state: ChatState) => Partial<ChatState> | null;
  validate?: (state: ChatState) => boolean;
  nextStage: (state: ChatState) => Stage;
  isRedFlag?: (state: ChatState) => boolean;
}

const COMPLAINTS = ["chest pain", "shortness of breath", "abdominal pain", "headache", "fever"];

// Condition-specific red flag questions
const RED_FLAG_QUESTIONS: Record<string, { question: string; field: string }[]> = {
  "chest pain": [
    { question: "Is the pain spreading to your arm, jaw, neck, or back?", field: "radiatingPain" },
    { question: "Are you sweating or feeling clammy?", field: "sweating" },
    { question: "Do you have any nausea or vomiting?", field: "nausea" },
  ],
  "shortness of breath": [
    { question: "Are you wheezing or making unusual sounds when breathing?", field: "wheezing" },
    { question: "Have you coughed up any blood?", field: "coughingBlood" },
    { question: "Do you have any chest pain or tightness?", field: "chestPain" },
  ],
  "abdominal pain": [
    { question: "Are you vomiting blood or something that looks like coffee grounds?", field: "vomitingBlood" },
    { question: "Have you noticed any blood in your stool or urine?", field: "bloodyStools" },
    { question: "Is the pain worse when you move or press on the area?", field: "worseWithMovement" },
    { question: "Do you have a fever or feel shivery?", field: "feverWithPain" },
    { question: "Are you pregnant or could you be pregnant?", field: "pregnancy" },
  ],
  "headache": [
    { question: "Did this headache come on suddenly like a thunderclap?", field: "thunderclap" },
    { question: "Do you have a stiff neck or does it hurt to bend your head forward?", field: "neckStiffness" },
    { question: "Are you experiencing any vision problems or seeing double?", field: "visualDisturbance" },
    { question: "Do you have any weakness, numbness, or difficulty speaking?", field: "neurologicalSymptoms" },
    { question: "Are you sensitive to light?", field: "photophobia" },
  ],
  "fever": [
    { question: "Do you have a rash that doesn't fade when you press a glass against it?", field: "nonBlanchingRash" },
    { question: "Do you have a stiff neck?", field: "neckStiffness" },
    { question: "Are you able to keep fluids down?", field: "canKeepFluids" },
  ],
};

// Fallback prompts for unclear responses
const FALLBACK_PROMPTS = {
  opening: {
    first: "I understand. Could you describe your main symptom in a bit more detail?",
    second: "What is the single thing that's bothering you most right now?",
    final: "Please tell me: are you experiencing chest pain, breathing problems, stomach pain, headache, or fever?"
  },
  localisation: {
    first: "Which part of your body is bothering you the most right now?",
    second: "Can you point to where the problem is? Upper body, lower body, head, chest, or stomach?",
    final: "Please tell me the area: head, chest, stomach, back, arms, or legs?"
  },
  time_start: {
    first: "Can you estimate: was it today, yesterday, or longer ago?",
    second: "Did this start hours ago, days ago, or weeks ago?",
    final: "Roughly how long have you had this problem?"
  },
  time_trend: {
    first: "Would you say it's better, worse, or about the same as when it started?",
    second: "Is the problem getting worse, getting better, or staying the same?",
    final: "Please tell me: worse, better, or the same?"
  },
  severity: {
    first: "If 0 is no problem and 10 is the worst possible, what number would you give it?",
    second: "Is it mild (1-3), moderate (4-6), or severe (7-10)?",
    final: "Just give me a number from 0 to 10 for how bad it is."
  },
  danger: {
    first: "Just to confirm, is that a yes or a no?",
    second: "I need a clear answer for safety. Yes or no?",
    final: "Please answer yes or no."
  },
  red_flags: {
    first: "Is that a yes or no?",
    second: "I need to know for safety. Yes or no?",
    final: "Please answer with yes or no."
  },
  context: {
    first: "Could you tell me a bit more about that?",
    second: "Any details you can share would help.",
    final: "You can say 'none' if nothing applies."
  },
  functional: {
    first: "Are you able to do that? Yes or no.",
    second: "Can you manage that normally? Yes or no.",
    final: "Please answer yes or no."
  }
};

function parseYesNo(input: string): boolean | null {
  const lower = input.toLowerCase().trim();
  const yesWords = ["yes", "y", "yeah", "yep", "true", "correct", "yea", "sure", "ok", "okay", "definitely", "absolutely", "i can", "i am", "i do"];
  const noWords = ["no", "n", "nope", "nah", "false", "negative", "none", "not", "can't", "cannot", "don't", "i can't", "i cannot", "i don't"];
  
  if (yesWords.some(w => lower === w || lower.startsWith(w + " ") || lower.includes(" " + w))) {
    return true;
  }
  if (noWords.some(w => lower === w || lower.startsWith(w + " ") || lower.includes(" " + w))) {
    return false;
  }
  return null;
}

function parseNumber(input: string): number | null {
  const match = input.match(/\d+/);
  return match ? parseInt(match[0]) : null;
}

function parseComplaint(input: string): string | null {
  const lower = input.toLowerCase();
  for (const complaint of COMPLAINTS) {
    if (lower.includes(complaint)) {
      return complaint;
    }
  }
  // Extended matching
  if (lower.includes("chest") || lower.includes("heart")) return "chest pain";
  if (lower.includes("breath") || lower.includes("breathing") || lower.includes("breathless") || lower.includes("can't breathe")) return "shortness of breath";
  if (lower.includes("stomach") || lower.includes("abdomen") || lower.includes("belly") || lower.includes("tummy") || lower.includes("gut")) return "abdominal pain";
  if (lower.includes("head") || lower.includes("migraine")) return "headache";
  if (lower.includes("fever") || lower.includes("temperature") || lower.includes("hot") || lower.includes("chills") || lower.includes("shiver")) return "fever";
  return null;
}

function getFallbackPrompt(stage: string, retryCount: number): string {
  let category = stage;
  if (stage.startsWith("danger_")) category = "danger";
  if (stage.startsWith("context_")) category = "context";
  if (stage.startsWith("functional_")) category = "functional";
  
  const prompts = FALLBACK_PROMPTS[category as keyof typeof FALLBACK_PROMPTS];
  if (!prompts) return "I didn't quite catch that. Could you try again?";
  
  if (retryCount === 0) return prompts.first;
  if (retryCount === 1) return prompts.second;
  return prompts.final;
}

// Patient-facing system prompt (111 call handler style)
const PATIENT_FACING_SYSTEM_PROMPT = `SYSTEM (Patient Triage Chat — Patient-Facing Only)

You are a medical triage chat assistant. Your job is to collect symptom information clearly and check for urgent warning signs.

You MUST NOT:
- suggest what the condition "could be"
- list diagnoses or differentials
- explain clinical reasoning in detail
- show citations or document references
- mention internal risk bands, rules, or "red flags triggered"

You MAY:
- ask natural, human questions (2–4 at a time)
- explain briefly why you're asking a question (1 sentence)
- give urgent escalation instructions if emergency warning signs appear

Safety override:
If the user reports emergency warning signs (severe chest pain/pressure, severe breathing trouble, blue lips, collapse/fainting, confusion, seizure, sudden "worst headache", stiff neck with fever, purple rash that doesn't fade, heavy bleeding), immediately tell them to call 999 or go to A&E now. Keep it short.

Conversation style:
- Start vague/open-ended.
- Ask 2–4 short questions per message, easy to answer.
- Summarise what you heard in 1 line when helpful.
- Keep it simple, everyday language.

Goal:
Collect the key details needed for triage: what symptoms, when it started, severity, important associated symptoms, and any urgent warning signs.

Output must end with clear questions for the patient to answer.`;

export function getNextQuestion(state: ChatState, stage: Stage): { question: string; nextStage: Stage } {
  switch (stage) {
    case "opening":
      return {
        question: "Can you tell me what's happening right now and what made you seek help today?",
        nextStage: "localisation"
      };
    
    case "localisation":
      return {
        question: "Where in your body is the main problem?",
        nextStage: "time_start"
      };
    
    case "time_start":
      return {
        question: "When did this start?",
        nextStage: "time_trend"
      };
    
    case "time_trend":
      return {
        question: "Is it getting better, worse, or staying the same?",
        nextStage: "severity"
      };
    
    case "severity":
      return {
        question: "On a scale from 0 to 10, how severe is it right now?",
        nextStage: "danger_breathing"
      };
    
    // Immediate danger checks - one at a time
    case "danger_breathing":
      return {
        question: "Are you having trouble breathing right now?",
        nextStage: "danger_collapse"
      };
    
    case "danger_collapse":
      return {
        question: "Have you collapsed, fainted, or felt close to passing out?",
        nextStage: "danger_severe_pain"
      };
    
    case "danger_severe_pain":
      return {
        question: "Is the pain severe or unbearable?",
        nextStage: "danger_bleeding"
      };
    
    case "danger_bleeding":
      return {
        question: "Are you bleeding heavily right now?",
        nextStage: "danger_confusion"
      };
    
    case "danger_confusion":
      return {
        question: "Are you confused, drowsy, or hard to wake?",
        nextStage: "red_flags"
      };
    
    case "red_flags":
      const complaint = state.complaint?.toLowerCase() || "";
      const questions = RED_FLAG_QUESTIONS[complaint] || [];
      const answeredFields = Object.keys(state);
      const nextQuestion = questions.find(q => !answeredFields.includes(q.field));
      
      if (nextQuestion) {
        return {
          question: nextQuestion.question,
          nextStage: "red_flags"
        };
      }
      return {
        question: "",
        nextStage: "rag_followup"
      };
    
    case "rag_followup":
      // This stage is handled dynamically with RAG-generated questions
      // The question will be set by the async handler
      return {
        question: "",
        nextStage: "context_conditions"
      };
    
    case "context_conditions":
      return {
        question: "Do you have any long-term medical conditions?",
        nextStage: "context_medications"
      };
    
    case "context_medications":
      return {
        question: "Are you taking any regular medications?",
        nextStage: "context_surgery"
      };
    
    case "context_surgery":
      return {
        question: "Have you had any surgery in this area before?",
        nextStage: "functional_eat"
      };
    
    case "functional_eat":
      return {
        question: "Are you able to eat or drink?",
        nextStage: "functional_move"
      };
    
    case "functional_move":
      return {
        question: "Can you move around normally?",
        nextStage: "functional_activities"
      };
    
    case "functional_activities":
      return {
        question: "Is this stopping you from doing normal daily activities?",
        nextStage: "collect_name"
      };
    
    case "collect_name":
      return {
        question: "Thank you for that information. Before I complete your assessment, can I take your full name please?",
        nextStage: "summary"
      };
    
    case "summary":
      return {
        question: generateSummaryConfirmation(state),
        nextStage: "complete"
      };
    
    default:
      return {
        question: "Thank you for completing the assessment.",
        nextStage: "complete"
      };
  }
}

function generateSummaryConfirmation(state: ChatState): string {
  let summary = `Thank you ${state.patientName || 'for that information'}. Let me confirm what you've told me:\n\n`;
  summary += `- Name: ${state.patientName || 'Not provided'}\n`;
  summary += `- Main concern: ${state.complaint || 'Not specified'}\n`;
  summary += `- Location: ${state.location || 'Not specified'}\n`;
  summary += `- Started: ${state.onset || 'Not specified'}\n`;
  summary += `- Trend: ${state.timeTrend || 'Not specified'}\n`;
  summary += `- Severity: ${state.severity !== undefined ? state.severity + '/10' : 'Not rated'}\n`;
  if (state.medicalHistory && state.medicalHistory !== "None reported") {
    summary += `- Medical conditions: ${state.medicalHistory}\n`;
  }
  if (state.medications && state.medications !== "None") {
    summary += `- Medications: ${state.medications}\n`;
  }
  summary += `\nIs this correct? (Yes/No)`;
  return summary;
}

// Generate a RAG-guided follow-up question based on symptoms and document knowledge
export async function generateRAGQuestion(state: ChatState, ragContext: string): Promise<string | null> {
  // If no RAG context available, skip RAG questions
  if (!ragContext || ragContext.trim().length === 0) {
    return null;
  }
  
  const symptomDescription = `
Patient symptoms:
- Complaint: ${state.complaint || 'Unknown'}
- Location: ${state.location || 'Not specified'}
- Onset: ${state.onset || 'Not specified'}
- Trend: ${state.timeTrend || 'Unknown'}
- Severity: ${state.severity !== undefined ? state.severity + '/10' : 'Unknown'}
- Opening description: ${state.openingDescription || ''}
`;

  try {
    // Use LLM to generate a natural follow-up question based on RAG context
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: PATIENT_FACING_SYSTEM_PROMPT + "\n\nYou are generating a single follow-up question to help narrow down the possible condition. Ask 1-2 natural questions that would help differentiate between possibilities mentioned in the clinical guidance."
        },
        {
          role: "user",
          content: `Based on the following patient symptoms and clinical guidance, generate ONE natural follow-up question (2-4 short questions) that would help narrow down what this could be.\n\nPatient symptoms:\n${symptomDescription}\n\nRelevant clinical guidance:\n${ragContext}\n\nGenerate a question that would help differentiate between possible conditions mentioned in the guidance.`
        }
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    const question = response.choices[0]?.message?.content?.trim();
    return question || null;
  } catch (error) {
    console.error("Error generating RAG question:", error);
    // Fallback to simple questions
    const questions = [
      `Based on your symptoms, have you experienced any similar episodes in the past?`,
      `Have you noticed if your symptoms are worse at any particular time of day?`,
      `Is there anything else that you think might be relevant to your symptoms that we haven't discussed?`
    ];
    
    const ragCount = state.ragQuestionsAsked || 0;
    if (ragCount < questions.length) {
      return questions[ragCount];
    }
    
    return null;
  }
}

// Emergency response message
const EMERGENCY_RESPONSE = "Based on what you've told me, this could be urgent. You need emergency medical help now. Please call 999 or go to A&E immediately.";

// Safety net message - always included at the end
const SAFETY_NET = "\n\nIf your symptoms suddenly get worse, or you develop new symptoms like severe pain, breathlessness, collapse, or bleeding, seek urgent medical help immediately.";

// Generate LLM response for patient-facing chat
async function generatePatientResponse(
  userInput: string,
  conversationHistory: ChatMessage[],
  currentState: ChatState,
  currentStage: Stage
): Promise<string> {
  try {
    // Build conversation context
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: PATIENT_FACING_SYSTEM_PROMPT }
    ];

    // Add conversation history (last 10 messages for context)
    const recentHistory = conversationHistory.slice(-10);
    messages.push(...recentHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    })));

    // Add current user input
    messages.push({ role: "user", content: userInput });

    // Add current state context for the LLM
    const stateContext = `
Current assessment stage: ${currentStage}
Information collected so far:
${currentState.complaint ? `- Main concern: ${currentState.complaint}` : ''}
${currentState.location ? `- Location: ${currentState.location}` : ''}
${currentState.onset ? `- When it started: ${currentState.onset}` : ''}
${currentState.severity !== undefined ? `- Severity: ${currentState.severity}/10` : ''}
${currentState.timeTrend ? `- Trend: ${currentState.timeTrend}` : ''}
`.trim();

    if (stateContext.length > 50) {
      messages.push({
        role: "system",
        content: `Internal context (do not mention to patient): ${stateContext}`
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages as any,
      max_tokens: 300,
      temperature: 0.7
    });

    return response.choices[0]?.message?.content || "I understand. Could you tell me more about that?";
  } catch (error) {
    console.error("Error generating patient response:", error);
    // Fallback to deterministic response
    return getNextQuestion(currentState, currentStage).question;
  }
}

// Check for emergency warning signs in user input
function checkEmergencySigns(input: string): boolean {
  const lower = input.toLowerCase();
  const emergencyKeywords = [
    "severe chest pain", "severe breathing", "can't breathe", "blue lips",
    "collapsed", "fainted", "fainting", "confusion", "confused", "seizure",
    "worst headache", "stiff neck", "fever", "purple rash", "heavy bleeding",
    "bleeding heavily", "unconscious", "not responding"
  ];
  return emergencyKeywords.some(keyword => lower.includes(keyword));
}

export async function processUserMessage(
  input: string,
  conversationHistory: ChatMessage[],
  currentState: ChatState, 
  currentStage: Stage,
  retryCount: number = 0
): Promise<{ newState: ChatState; newStage: Stage; response: string; isEscalation: boolean; isComplete: boolean; newRetryCount: number }> {
  
  let newState = { ...currentState };
  let newStage: Stage = currentStage;
  let response = "";
  let isEscalation = false;
  let isComplete = false;
  let newRetryCount = 0;

  // Check for emergency signs first
  if (checkEmergencySigns(input)) {
    return {
      newState,
      newStage: "escalated",
      response: "Based on what you've told me, this could be urgent. You need emergency medical help now. Please call 999 or go to A&E immediately.",
      isEscalation: true,
      isComplete: true,
      newRetryCount: 0
    };
  }

  // After 3 failed attempts, try to continue with partial info
  const maxRetries = 3;
  if (retryCount >= maxRetries) {
    // Move to next stage with whatever we have
    const stages: Stage[] = ["opening", "localisation", "time_start", "time_trend", "severity", 
      "danger_breathing", "danger_collapse", "danger_severe_pain", "danger_bleeding", "danger_confusion",
      "red_flags", "context_conditions", "context_medications", "context_surgery", 
      "functional_eat", "functional_move", "functional_activities", "summary"];
    const currentIndex = stages.indexOf(currentStage);
    if (currentIndex < stages.length - 1) {
      newStage = stages[currentIndex + 1];
      response = getNextQuestion(newState, newStage).question;
      return { newState, newStage, response, isEscalation, isComplete, newRetryCount: 0 };
    }
  }

  switch (currentStage) {
    case "opening": {
      // Try to extract complaint from open-ended response
      const complaint = parseComplaint(input);
      if (complaint) {
        newState.complaint = complaint;
        newState.openingDescription = input.trim();
        newStage = "localisation";
        response = getNextQuestion(newState, newStage).question;
      } else if (input.trim().length > 10) {
        // Accept detailed description even without recognized complaint
        newState.openingDescription = input.trim();
        newStage = "localisation";
        response = "Thank you for explaining. " + getNextQuestion(newState, newStage).question;
      } else {
        response = getFallbackPrompt("opening", retryCount);
        newRetryCount = retryCount + 1;
      }
      break;
    }

    case "localisation": {
      const location = input.trim();
      if (location.length > 0) {
        newState.location = location;
        // Try to extract complaint from location if not already set
        if (!newState.complaint) {
          const complaint = parseComplaint(location);
          if (complaint) newState.complaint = complaint;
        }
        newStage = "time_start";
      } else {
        newRetryCount = retryCount + 1;
      }
      response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getNextQuestion(newState, newStage).question;
      break;
    }

    case "time_start": {
      const onset = input.trim();
      if (onset.length > 0) {
        newState.onset = onset;
        newStage = "time_trend";
      } else {
        newRetryCount = retryCount + 1;
      }
      response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getNextQuestion(newState, newStage).question;
      break;
    }

    case "time_trend": {
      const trend = input.trim().toLowerCase();
      if (trend.length > 0) {
        newState.timeTrend = trend;
        // Check for worsening as warning sign
        if (trend.includes("worse") || trend.includes("worsening")) {
          newState.gettingWorse = true;
        }
        newStage = "severity";
      } else {
        newRetryCount = retryCount + 1;
      }
      response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getNextQuestion(newState, newStage).question;
      break;
    }

    case "severity": {
      const severity = parseNumber(input);
      if (severity !== null && severity >= 0 && severity <= 10) {
        newState.severity = severity;
        newStage = "danger_breathing";
      } else {
        newRetryCount = retryCount + 1;
      }
      response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getNextQuestion(newState, newStage).question;
      break;
    }

    // Immediate danger checks
    case "danger_breathing": {
      const answer = parseYesNo(input);
      if (answer !== null) {
        newState.troubleBreathing = answer;
        if (answer === true) {
          return {
            newState,
            newStage: "escalated",
            response: EMERGENCY_RESPONSE,
            isEscalation: true,
            isComplete: true,
            newRetryCount: 0
          };
        }
        newStage = "danger_collapse";
      } else {
        newRetryCount = retryCount + 1;
      }
      response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getNextQuestion(newState, newStage).question;
      break;
    }

    case "danger_collapse": {
      const answer = parseYesNo(input);
      if (answer !== null) {
        newState.collapse = answer;
        if (answer === true) {
          return {
            newState,
            newStage: "escalated",
            response: EMERGENCY_RESPONSE,
            isEscalation: true,
            isComplete: true,
            newRetryCount: 0
          };
        }
        newStage = "danger_severe_pain";
      } else {
        newRetryCount = retryCount + 1;
      }
      response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getNextQuestion(newState, newStage).question;
      break;
    }

    case "danger_severe_pain": {
      const answer = parseYesNo(input);
      if (answer !== null) {
        newState.severePain = answer;
        if (answer === true && (newState.severity ?? 0) >= 8) {
          return {
            newState,
            newStage: "escalated",
            response: EMERGENCY_RESPONSE,
            isEscalation: true,
            isComplete: true,
            newRetryCount: 0
          };
        }
        newStage = "danger_bleeding";
      } else {
        newRetryCount = retryCount + 1;
      }
      response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getNextQuestion(newState, newStage).question;
      break;
    }

    case "danger_bleeding": {
      const answer = parseYesNo(input);
      if (answer !== null) {
        newState.severeBleeding = answer;
        if (answer === true) {
          return {
            newState,
            newStage: "escalated",
            response: EMERGENCY_RESPONSE,
            isEscalation: true,
            isComplete: true,
            newRetryCount: 0
          };
        }
        newStage = "danger_confusion";
      } else {
        newRetryCount = retryCount + 1;
      }
      response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getNextQuestion(newState, newStage).question;
      break;
    }

    case "danger_confusion": {
      const answer = parseYesNo(input);
      if (answer !== null) {
        newState.confusion = answer;
        if (answer === true) {
          return {
            newState,
            newStage: "escalated",
            response: EMERGENCY_RESPONSE,
            isEscalation: true,
            isComplete: true,
            newRetryCount: 0
          };
        }
        newStage = "red_flags";
        const nextQ = getNextQuestion(newState, newStage);
        if (!nextQ.question) {
          newStage = "context_conditions";
        }
      } else {
        newRetryCount = retryCount + 1;
      }
      response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getNextQuestion(newState, newStage).question;
      break;
    }

    case "red_flags": {
      const complaint = newState.complaint?.toLowerCase() || "";
      const questions = RED_FLAG_QUESTIONS[complaint] || [];
      const answeredFields = Object.keys(newState);
      const currentQuestion = questions.find(q => !answeredFields.includes(q.field));
      
      if (currentQuestion) {
        const answer = parseYesNo(input);
        if (answer !== null) {
          newState[currentQuestion.field] = answer;
          
          // Critical red flags that need immediate escalation
          const criticalFlags = ["thunderclap", "nonBlanchingRash", "vomitingBlood", "neurologicalSymptoms", "coughingBlood", "bloodyStools"];
          if (answer === true && criticalFlags.includes(currentQuestion.field)) {
            return {
              newState,
              newStage: "escalated",
              response: EMERGENCY_RESPONSE,
              isEscalation: true,
              isComplete: true,
              newRetryCount: 0
            };
          }
          
          // Get next red flag question
          const nextQ = getNextQuestion(newState, "red_flags");
          if (!nextQ.question) {
            // Move to RAG followup (handled async in routes)
            newStage = "rag_followup";
            newState.ragQuestionsAsked = 0;
            response = ""; // Will be set by async RAG handler
          } else {
            response = await generatePatientResponse(input, conversationHistory, newState, newStage) || nextQ.question;
          }
        } else {
          newRetryCount = retryCount + 1;
          response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getFallbackPrompt("red_flags", retryCount);
        }
      } else {
        // Move to RAG followup (handled async in routes)
        newStage = "rag_followup";
        newState.ragQuestionsAsked = 0;
        response = ""; // Will be set by async RAG handler
      }
      break;
    }

    case "rag_followup": {
      // Store the answer to the RAG question
      const ragCount = (newState.ragQuestionsAsked || 0);
      newState[`ragAnswer${ragCount}`] = input.trim();
      newState.ragQuestionsAsked = ragCount + 1;
      
      // Check if we should ask more RAG questions (max 3)
      if (ragCount < 2) {
        // Will be set by async RAG handler
        response = "";
      } else {
        // Move to context questions
        newStage = "context_conditions";
        response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getNextQuestion(newState, newStage).question;
      }
      break;
    }

    case "context_conditions": {
      newState.medicalHistory = input.trim() || "None reported";
      newStage = "context_medications";
      response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getNextQuestion(newState, newStage).question;
      break;
    }

    case "context_medications": {
      newState.medications = input.trim() || "None";
      newStage = "context_surgery";
      response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getNextQuestion(newState, newStage).question;
      break;
    }

    case "context_surgery": {
      newState.previousSurgery = input.trim() || "None";
      newStage = "functional_eat";
      response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getNextQuestion(newState, newStage).question;
      break;
    }

    case "functional_eat": {
      const answer = parseYesNo(input);
      if (answer !== null) {
        newState.canEatDrink = answer;
      } else {
        newState.canEatDrink = !input.toLowerCase().includes("no");
      }
      newStage = "functional_move";
      response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getNextQuestion(newState, newStage).question;
      break;
    }

    case "functional_move": {
      const answer = parseYesNo(input);
      if (answer !== null) {
        newState.canMove = answer;
      } else {
        newState.canMove = !input.toLowerCase().includes("no");
      }
      newStage = "functional_activities";
      response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getNextQuestion(newState, newStage).question;
      break;
    }

    case "functional_activities": {
      const answer = parseYesNo(input);
      newState.stoppingActivities = answer === true || input.toLowerCase().includes("yes");
      newStage = "collect_name";
      response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getNextQuestion(newState, newStage).question;
      break;
    }

    case "collect_name": {
      const name = input.trim();
      if (name.length >= 2) {
        newState.patientName = name;
        newStage = "summary";
        response = await generatePatientResponse(input, conversationHistory, newState, newStage) || getNextQuestion(newState, newStage).question;
      } else {
        response = "I need your full name to complete the assessment. Could you please provide your first and last name?";
        newRetryCount = retryCount + 1;
      }
      break;
    }

    case "summary": {
      const confirmed = parseYesNo(input);
      if (confirmed === true) {
        newStage = "complete";
        isComplete = true;
        response = generateFinalResponse(newState);
      } else if (confirmed === false) {
        newStage = "opening";
        response = "No problem, let's start again. " + getNextQuestion(newState, "opening").question;
        newState = {}; // Reset state
      } else {
        response = "Is the information correct? Please answer yes or no.";
        newRetryCount = retryCount + 1;
      }
      break;
    }

    default:
      response = "Thank you for completing the assessment." + SAFETY_NET;
      isComplete = true;
  }

  return { newState, newStage, response, isEscalation, isComplete, newRetryCount };
}

function generateFinalResponse(state: ChatState): string {
  // Classify internally (not exposed to user)
  const result = buildTriageFromChat(state);
  
  let response = "";
  
  if (result.riskBand === "Red") {
    response = "Based on your answers, this could be serious and needs urgent medical attention. Please call 999 or go to A&E now.";
  } else if (result.riskBand === "Amber") {
    response = "This needs to be assessed today. I recommend contacting NHS 111 or attending an urgent care centre today.";
  } else if (result.redFlags.length > 0) {
    response = "This doesn't sound immediately dangerous, but you should arrange a GP appointment soon given your symptoms.";
  } else {
    response = "This sounds like something that can often be managed at home. I'll share some self-care advice with your assessment.";
  }
  
  // Always add safety net
  response += SAFETY_NET;
  
  response += "\n\nYour assessment has been recorded and a summary is now available for review.";
  
  return response;
}

const GREEN_RECOMMENDATIONS: Record<string, string[]> = {
  "chest pain": [
    "Rest and avoid strenuous physical activity",
    "Monitor your symptoms - if pain worsens or spreads, seek immediate medical attention",
    "Consider over-the-counter antacids if the pain feels like heartburn",
    "Keep a symptom diary noting when pain occurs and what triggers it",
    "Schedule an appointment with your GP within the next few days"
  ],
  "shortness of breath": [
    "Rest in a comfortable position and try to relax",
    "Practice slow, deep breathing exercises",
    "Avoid known triggers such as allergens or strenuous activity",
    "Stay hydrated and keep your environment well-ventilated",
    "Book an appointment with your GP to discuss your symptoms"
  ],
  "abdominal pain": [
    "Stay hydrated with clear fluids",
    "Eat light, bland foods if tolerated",
    "Apply a warm compress to your abdomen for comfort",
    "Avoid spicy, fatty, or acidic foods",
    "Rest and monitor your symptoms - see a GP if they persist beyond 24-48 hours"
  ],
  "headache": [
    "Rest in a quiet, dark room",
    "Stay well hydrated",
    "Consider over-the-counter pain relief like paracetamol or ibuprofen",
    "Apply a cold or warm compress to your forehead or neck",
    "Reduce screen time and take regular breaks from work"
  ],
  "fever": [
    "Rest and get plenty of sleep",
    "Drink plenty of fluids to stay hydrated",
    "Take paracetamol or ibuprofen to help reduce temperature",
    "Wear light clothing and keep your room cool",
    "Monitor your temperature and seek medical advice if it exceeds 39.4°C (103°F)"
  ]
};

export function getGreenRecommendations(complaint: string): string[] {
  const lowerComplaint = complaint.toLowerCase();
  return GREEN_RECOMMENDATIONS[lowerComplaint] || [
    "Rest and monitor your symptoms",
    "Stay well hydrated",
    "Take over-the-counter pain relief if needed",
    "Schedule an appointment with your GP if symptoms persist",
    "Return for assessment if your condition worsens"
  ];
}

export function buildTriageFromChat(state: ChatState) {
  const answers = {
    complaint: state.complaint || "",
    age: state.age || 0,
    sex: state.sex || "",
    severity: state.severity || 0,
    onset: state.onset,
    location: state.location,
    duration: state.duration,
    character: state.character,
    aggravating: state.aggravating,
    relieving: state.relieving,
    associated: state.associated,
    medicalHistory: state.medicalHistory,
    medications: state.medications,
    allergies: state.allergies,
    // Danger check answers
    troubleBreathing: state.troubleBreathing,
    collapse: state.collapse,
    severePain: state.severePain,
    severeBleeding: state.severeBleeding,
    confusion: state.confusion,
    // Red flag answers
    shortnessOfBreath: state.shortnessOfBreath,
    radiatingPain: state.radiatingPain,
    sweating: state.sweating,
    nausea: state.nausea,
    cardiacHistory: state.cardiacHistory,
    cyanosis: state.cyanosis,
    speakingDifficulty: state.speakingDifficulty,
    vomitingBlood: state.vomitingBlood,
    bloodyStools: state.bloodyStools,
    worseWithMovement: state.worseWithMovement,
    rigidAbdomen: state.rigidAbdomen,
    pregnancy: state.pregnancy,
    feverWithPain: state.feverWithPain,
    thunderclap: state.thunderclap,
    neckStiffness: state.neckStiffness,
    visualDisturbance: state.visualDisturbance,
    neurologicalSymptoms: state.neurologicalSymptoms,
    photophobia: state.photophobia,
    nonBlanchingRash: state.nonBlanchingRash,
    canKeepFluids: state.canKeepFluids,
    wheezing: state.wheezing,
    coughingBlood: state.coughingBlood,
    chestPain: state.chestPain,
  };
  
  const result = evaluateTriage(answers);
  
  // Add recommendations for green band
  if (result.riskBand === "Green") {
    return {
      ...result,
      recommendations: getGreenRecommendations(state.complaint || "")
    };
  }
  
  return result;
}
