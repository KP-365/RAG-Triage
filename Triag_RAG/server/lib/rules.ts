// Triage Rules Engine
// Version: 0.1.0

type RiskBand = "Red" | "Amber" | "Green";

interface TriageResult {
  riskBand: RiskBand;
  redFlags: string[];
  summary: string;
}

interface Answers {
  complaint: string;
  age: number;
  sex: string;
  severity: number;
  [key: string]: any;
}

export function evaluateTriage(answers: Answers): TriageResult {
  const flags: string[] = [];
  let band: RiskBand = "Green";

  const { severity, age } = answers;
  const complaint = answers.complaint?.toLowerCase() || "";

  // --- Global Red Flags ---
  if (answers.confusion) flags.push("New confusion");
  if (answers.severeBleeding) flags.push("Severe bleeding");
  if (severity >= 9) flags.push("Pain severity 9-10/10");

  // --- Complaint Specific Rules ---
  
  // Chest Pain
  if (complaint === "chest pain") {
    if (answers.shortnessOfBreath) flags.push("Chest pain + SOB");
    if (answers.radiatingPain) flags.push("Radiating pain");
    if (age > 50 && severity > 5) flags.push("Age > 50 with moderate chest pain");
    if (answers.cardiacHistory) flags.push("History of heart disease");
  }

  // Shortness of Breath
  if (complaint === "shortness of breath") {
    if (answers.cyanosis) flags.push("Cyanosis (blue lips/skin)");
    if (answers.speakingDifficulty) flags.push("Unable to speak full sentences");
  }

  // Abdominal Pain
  if (complaint === "abdominal pain") {
    if (answers.vomitingBlood) flags.push("Vomiting blood");
    if (answers.rigidAbdomen) flags.push("Rigid abdomen");
    if (answers.pregnancy && answers.bleeding) flags.push("Pregnancy + bleeding");
  }

  // Headache
  if (complaint === "headache") {
    if (answers.thunderclap) flags.push("Sudden 'thunderclap' onset");
    if (answers.neckStiffness) flags.push("Neck stiffness");
    if (answers.visualDisturbance) flags.push("Visual disturbance");
  }

  // Determine Band
  if (flags.length > 0) {
    band = "Red";
  } else if (severity >= 6 || age > 75) {
    band = "Amber";
  }

  // Generate Summary
  const summary = `${age}y ${answers.sex} presenting with ${complaint} (Severity ${severity}/10). Risk: ${band}. Flags: ${flags.length > 0 ? flags.join(", ") : "None"}.`;

  return {
    riskBand: band,
    redFlags: flags,
    summary,
  };
}
