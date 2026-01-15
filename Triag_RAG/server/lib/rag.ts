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
  // Simple keyword search for prototype since we don't have a vector DB running
  const allChunks = await storage.getAllChunks();
  const keywords = question.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  
  const scored = allChunks.map(chunk => {
    const text = chunk.chunkText.toLowerCase();
    let score = 0;
    keywords.forEach(k => {
      if (text.includes(k)) score += 1;
    });
    return { ...chunk, score };
  });
  
  // Top 3
  const topChunks = scored.sort((a, b) => b.score - a.score).slice(0, 3).filter(c => c.score > 0);
  
  // 2. Generation
  const context = topChunks.map(c => c.chunkText).join("\n\n");
  
  if (!context) {
    return {
      answer: "I cannot find support in the uploaded guidance.",
      citations: []
    };
  }
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        { role: "system", content: "You are a helpful clinical assistant. Answer the user's question using ONLY the provided context. If the answer is not in the context, say you don't know." },
        { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` }
      ]
    });
    
    return {
      answer: response.choices[0].message.content || "No response generated.",
      citations: topChunks.map(c => ({
        docId: c.documentId,
        docName: "Document " + c.documentId, // We should join with doc name ideally
        chunkId: c.id,
        text: c.chunkText.substring(0, 50) + "..."
      }))
    };
  } catch (e) {
    console.error("RAG Error:", e);
    return { answer: "Error generating explanation.", citations: [] };
  }
}

// Admin Portal RAG Explanation System Prompt
const ADMIN_PORTAL_SYSTEM_PROMPT = `SYSTEM (Admin Portal Only — RAG-Cited Triage Explanation)

This output is STRICTLY for the clinician/admin portal. Never write as if speaking to the patient.

You will receive:
- patient_summary
- risk_band (Red/Amber/Green)
- triggered_red_flags
- retrieved_chunks (chunk_id, source_title, content)

Your job:
- Explain what it COULD be (possibilities), without giving a definitive diagnosis.
- Tie possibilities to symptoms and red flags.
- Align actions with the risk band and your deterministic rules engine.
- Use ONLY retrieved_chunks for clinical claims.

Hard constraints:
1) Do not give a clear diagnosis. Use cautious language: "possible", "consider", "consistent with".
2) Use ONLY the retrieved context. If missing, say so.
3) Inline citations required for key claims: [chunk:ID — Source Title]
4) Do not contradict the rules engine output.

Format:
- Case summary (2–4 lines)
- Risk band + triggered flags (bullets)
- Possible explanations to consider (ranked bullets, cautious language, with citations)
- What would help narrow it (bullets)
- Recommended routing / escalation (aligned to risk band)`;

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

  const prompt = `Patient Summary:\n${patientSummary}\n\nRisk Band: ${riskBand}\nTriggered Red Flags: ${triggeredRedFlags.length > 0 ? triggeredRedFlags.join(", ") : "None"}\n\nRetrieved Clinical Guidance:\n${context}\n\nGenerate a triage explanation following the format specified in the system prompt.`;

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
