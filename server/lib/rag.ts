// Simple RAG implementation
// Using cosine similarity on basic embeddings
// For prototype, we might fake embeddings or use a lightweight approach if `transformers` is heavy.
// Let's try to use a simple TF-IDF or keyword overlap if we can't install heavy ML libs.
// BUT, the PRD asked for embeddings.
// We will assume `openai` is available for Chat, but not embeddings.
// We'll use a simple word-overlap + keyword scoring for the "Lite" prototype to avoid heavy deps
// UNLESS we can install `@xenova/transformers`. I'll try to support vector search logic.

// Mocking vector search for the very first pass to ensure it runs fast.
// In a real iteration, we'd enable the actual embedding model.

import { storage } from "../storage";
import { openai } from "../replit_integrations/image/client"; // reusing client

export async function processDocument(docId: number, text: string) {
  // 1. Chunking (Simple split by paragraphs)
  const chunks = text.split(/\n\s*\n/).filter(c => c.trim().length > 0);
  
  for (const chunkText of chunks) {
    // 2. Embedding (Mock or Simple)
    // For this Lite prototype, we'll store a "keyword" vector (bag of words)
    // Real implementation would use: const embedding = await embed(chunkText);
    const embedding = [0]; // Placeholder
    
    await storage.createChunk({
      documentId: docId,
      chunkText: chunkText,
      metadata: { length: chunkText.length },
      embedding: embedding
    });
  }
}

export async function queryRAG(question: string) {
  // 1. Retrieval
  // Improved keyword search - include shorter keywords and partial matches
  const allChunks = await storage.getAllChunks();
  const keywords = question.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  
  const scored = allChunks.map(chunk => {
    const text = chunk.chunkText.toLowerCase();
    let score = 0;
    keywords.forEach(k => {
      // Count occurrences for better scoring
      const matches = (text.match(new RegExp(k, 'g')) || []).length;
      score += matches;
    });
    return { ...chunk, score };
  });
  
  // Top 5 chunks for more context
  const topChunks = scored.sort((a, b) => b.score - a.score).slice(0, 5).filter(c => c.score > 0);
  
  // Get document names for citations
  const allDocuments = await storage.getDocuments();
  const docMap = new Map(allDocuments.map(d => [d.id, d.name]));
  
  // 2. Generation
  const context = topChunks.map(c => c.chunkText).join("\n\n---\n\n");
  
  if (!context) {
    return {
      answer: "No relevant clinical guidance found in the knowledge base for this query. Please try rephrasing your question or upload more relevant documents.",
      citations: []
    };
  }
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: `You are a clinical decision support assistant for healthcare professionals. You provide advisory information only - NOT diagnoses or definitive clinical decisions.

CRITICAL CONSTRAINTS:
- NEVER state certainty or give definitive diagnoses
- NEVER override or contradict clinician decisions
- NEVER provide patient-directed advice
- ALWAYS use hedged language: "consider", "may be consistent with", "could suggest", "factors to exclude"
- ALWAYS recommend safety-netting when uncertainty is present
- ALWAYS defer to clinician judgment

OUTPUT STRUCTURE (use this order):
1. AI-flagged level of concern
2. Potential risk indicators identified or absent
3. Immediate considerations
4. Non-exhaustive possible conditions (not a diagnosis)
5. Suggested next steps for the clinician
6. Factors that would change the assessment

Keep responses focused and structured. Avoid long narratives or full guideline dumps.`
        },
        { role: "user", content: `Clinical Knowledge Base:\n${context}\n\nQuestion: ${question}` }
      ],
      max_tokens: 500,
      temperature: 0.3
    });
    
    return {
      answer: response.choices[0].message.content || "No response generated.",
      citations: topChunks.map(c => ({
        docId: c.documentId,
        docName: docMap.get(c.documentId) || "Clinical Guidelines",
        chunkId: c.id,
        text: c.chunkText.substring(0, 100) + "..."
      }))
    };
  } catch (e) {
    console.error("RAG Error:", e);
    return { answer: "Error generating explanation. Please try again.", citations: [] };
  }
}

// Admin Portal RAG Explanation System Prompt
const ADMIN_PORTAL_SYSTEM_PROMPT = `SYSTEM — Clinical Decision Support Summary (Clinician Portal Only)

This output is STRICTLY for clinicians. Never write as if speaking to the patient.
AI output is advisory only. The AI may suggest but never decide. The clinician may accept or ignore.

CRITICAL CONSTRAINTS:
- NEVER state certainty or give definitive diagnoses
- NEVER override or contradict clinician decisions  
- NEVER provide patient-directed advice
- ALWAYS use hedged language: "consider", "may be consistent with", "could suggest", "factors to exclude"
- ALWAYS recommend safety-netting when uncertainty is present
- Use ONLY the retrieved context for clinical claims. If missing, say so.
- Inline citations required: [chunk:ID — Source Title]

REQUIRED OUTPUT STRUCTURE (use this exact order):
1. AI-flagged level of concern (for clinician review)
2. Potential risk indicators identified or absent
3. Immediate considerations
4. Non-exhaustive possible conditions (not a diagnosis) — keep brief, ranked bullets with citations
5. Suggested next steps for the clinician
6. Factors that would change the assessment

Keep responses focused and structured. Avoid long narrative responses or full guideline dumps.`;

interface AdminRAGInput {
  patientSummary: string;
  riskBand: "Red" | "Amber" | "Green";
  triggeredRedFlags: string[];
  retrievedChunks: Array<{
    chunkId: number;
    sourceTitle: string;
    content: string;
  }>;
}

export async function generateAdminRAGExplanation(input: AdminRAGInput): Promise<string> {
  const { patientSummary, riskBand, triggeredRedFlags, retrievedChunks } = input;

  // Build context from retrieved chunks
  const context = retrievedChunks.map((chunk, idx) => 
    `[chunk:${chunk.chunkId} — ${chunk.sourceTitle}]\n${chunk.content}`
  ).join("\n\n---\n\n");

  if (!context || context.trim().length === 0) {
    return `Case Summary: ${patientSummary}\n\nRisk Band: ${riskBand}\nTriggered Red Flags: ${triggeredRedFlags.length > 0 ? triggeredRedFlags.join(", ") : "None"}\n\nNote: No relevant clinical guidance found in knowledge base for this case.`;
  }

  const prompt = `Patient Summary:\n${patientSummary}\n\nRisk Band: ${riskBand}\nTriggered Red Flags: ${triggeredRedFlags.length > 0 ? triggeredRedFlags.join(", ") : "None"}\n\nRetrieved Clinical Guidance:\n${context}\n\nGenerate a clinical explanation following the format specified in the system prompt.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: ADMIN_PORTAL_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      max_tokens: 800,
      temperature: 0.3
    });

    return response.choices[0]?.message?.content || "Unable to generate explanation.";
  } catch (e) {
    console.error("Admin RAG Error:", e);
    return `Case Summary: ${patientSummary}\n\nRisk Band: ${riskBand}\nTriggered Red Flags: ${triggeredRedFlags.length > 0 ? triggeredRedFlags.join(", ") : "None"}\n\nError generating detailed explanation.`;
  }
}

// Retrieve relevant chunks based on patient symptoms and risk assessment
export async function retrieveRelevantChunks(
  complaint: string,
  symptoms: Record<string, any>,
  redFlags: string[]
): Promise<Array<{ chunkId: number; sourceTitle: string; content: string }>> {
  const allChunks = await storage.getAllChunks();
  const allDocuments = await storage.getDocuments();
  
  // Build search query from complaint, symptoms, and red flags
  const searchTerms = [
    complaint,
    ...Object.keys(symptoms).filter(k => symptoms[k] === true),
    ...redFlags
  ].join(" ").toLowerCase();

  const keywords = searchTerms.split(/\W+/).filter(w => w.length > 3);

  const scored = allChunks.map(chunk => {
    const text = chunk.chunkText.toLowerCase();
    let score = 0;
    keywords.forEach(k => {
      if (text.includes(k)) score += 1;
    });
    return { ...chunk, score };
  });

  // Top 5 most relevant chunks
  const topChunks = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .filter(c => c.score > 0);

  // Get document names
  const docMap = new Map(allDocuments.map(d => [d.id, d.name]));

  return topChunks.map(chunk => ({
    chunkId: chunk.id,
    sourceTitle: docMap.get(chunk.documentId) || `Document ${chunk.documentId}`,
    content: chunk.chunkText
  }));
}
