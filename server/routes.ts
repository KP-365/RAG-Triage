import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { evaluateTriage } from "./lib/rules";
import { processDocument, queryRAG, generateAdminRAGExplanation, retrieveRelevantChunks } from "./lib/rag";
import { z } from "zod";
import multer from "multer";
import { registerChatRoutes } from "./replit_integrations/chat";
import { getNextQuestion, processUserMessage, buildTriageFromChat, generateRAGQuestion, type Stage } from "./lib/chatStateMachine";
import type { ChatMessage, ChatState } from "@shared/schema";
import { generateHandoff, evaluateRedFlags, extractFactsFromMessages } from "./lib/handoff";
import {
  getAdminFromRequest,
  setAdminCookie,
  clearAdminCookie,
  requireAdmin,
  checkAdminCredentials,
} from "./lib/adminAuth";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Register Integration Routes
  registerChatRoutes(app);

  // Triage API
  app.post(api.triage.submit.path, async (req, res) => {
    try {
      const input = api.triage.submit.input.parse(req.body);
      
      // 1. Run Rules
      const result = evaluateTriage(input.answers);
      
      // 2. Save
      const submission = await storage.createSubmission({
        ...input,
        riskBand: result.riskBand,
        redFlags: result.redFlags,
        summary: result.summary,
        rulesVersion: "0.1.0",
        modelVersion: "gpt-5.1" // For RAG later
      });
      
      res.status(201).json(submission);
    } catch (err) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({
            message: err.errors[0].message,
            field: err.errors[0].path.join('.'),
          });
        }
        throw err;
    }
  });

  // Submissions API
  app.get(api.submissions.list.path, async (req, res) => {
    const list = await storage.getSubmissions();
    res.json(list);
  });

  app.get(api.submissions.get.path, async (req, res) => {
    const id = Number(req.params.id);
    const submission = await storage.getSubmission(id);
    if (!submission) return res.status(404).json({ message: "Not found" });
    const overrides = await storage.getOverrides(id);
    const sessionId = await storage.getSessionIdBySubmissionId(id);
    res.json({ ...submission, overrides, sessionId: sessionId ?? undefined });
  });

  app.post(api.submissions.override.path, async (req, res) => {
    const id = Number(req.params.id);
    const input = api.submissions.override.input.parse(req.body);
    const override = await storage.createOverride({ ...input, submissionId: id });
    res.status(201).json(override);
  });

  // Admin auth: login, me, logout
  app.post("/api/admin/login", (req, res) => {
    const { name, password } = req.body || {};
    if (!name || !password) {
      return res.status(400).json({ message: "name and password required" });
    }
    if (!checkAdminCredentials(name, password)) {
      return res.status(401).json({ message: "Invalid name or password" });
    }
    setAdminCookie(res, name);
    res.json({ name });
  });

  app.get("/api/admin/me", (req, res) => {
    if (!process.env.ADMIN_NAME || !process.env.ADMIN_PASSWORD) {
      return res.json({ name: "Admin" }); // auth disabled
    }
    const admin = getAdminFromRequest(req);
    if (!admin) return res.status(401).json({ message: "Not logged in" });
    res.json(admin);
  });

  app.post("/api/admin/logout", (req, res) => {
    clearAdminCookie(res);
    res.json({ ok: true });
  });

  // Admin-only: update submission (e.g. patient name); records "changed by [admin name]"
  app.patch("/api/submissions/:id", (req, res, next) => {
    if (process.env.ADMIN_NAME && process.env.ADMIN_PASSWORD) return requireAdmin(req, res, next);
    (req as any).admin = { name: "Admin" };
    next();
  }, async (req, res) => {
    const id = Number(req.params.id);
    const admin = (req as any).admin as { name: string };
    const body = req.body || {};
    const submission = await storage.getSubmission(id);
    if (!submission) return res.status(404).json({ message: "Not found" });
    const answers = (submission.answers as Record<string, any>) || {};
    if (typeof body.patientName === "string") {
      answers.patientName = body.patientName.trim();
    }
    const updated = await storage.updateSubmission(id, {
      answers,
      updatedBy: admin.name,
    });
    res.json(updated);
  });

  // Optional admin guard: when ADMIN_NAME/ADMIN_PASSWORD are set, require login for admin routes
  const adminGuard = (req: any, res: any, next: any) => {
    if (process.env.ADMIN_NAME && process.env.ADMIN_PASSWORD) return requireAdmin(req, res, next);
    next();
  };

  // Metrics: completion counts and hallucination proxy (extraction divergence %)
  app.get("/api/admin/metrics", adminGuard, async (req, res) => {
    try {
      const counts = await storage.getChatSessionCounts();
      const div = await storage.getDivergenceMetrics();
      const completed = counts.completed;
      const total = counts.total;
      const completionRatePct = total > 0 ? Math.round((completed / total) * 100) : 0;
      const hallucinationRatePct = completed > 0 ? Math.round((div.sessionsWithDivergence / completed) * 100) : 0;
      res.json({
        chatCompletion: {
          totalSessions: total,
          completed,
          active: counts.active,
          escalated: counts.escalated,
          completionRatePercentage: completionRatePct,
        },
        hallucinationProxy: {
          extractionDivergenceCount: div.divergenceCount,
          sessionsWithAtLeastOneDivergence: div.sessionsWithDivergence,
          hallucinationRatePercentage: hallucinationRatePct,
          note: "Hallucination proxy = % of completed sessions where LLM-extracted fact(s) disagreed with deterministic state.",
        },
      });
    } catch (err) {
      console.error("Error fetching admin metrics:", err);
      res.status(500).json({ message: "Failed to fetch metrics" });
    }
  });

  // Docs API (admin-only when env is set)
  app.get(api.documents.list.path, adminGuard, async (req, res) => {
    const list = await storage.getDocuments();
    res.json(list);
  });

  app.post(api.documents.upload.path, adminGuard, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file" });
    
    // Save Doc
    const doc = await storage.createDocument({
      name: req.file.originalname,
      source: "Upload"
    });
    
    // Process (Text extraction - simple utf8 for now)
    const text = req.file.buffer.toString('utf-8');
    await processDocument(doc.id, text);
    
    res.status(201).json({ success: true, count: 1 });
  });

  // RAG Query - with optional patient case context
  app.post(api.rag.query.path, async (req, res) => {
    const { question, submissionId } = req.body;
    
    // If submissionId provided, include patient case in query context
    let patientContext = "";
    if (submissionId) {
      const submission = await storage.getSubmission(Number(submissionId));
      if (submission) {
        const answers = submission.answers as Record<string, any>;
        patientContext = `
CURRENT PATIENT CASE:
- Name: ${answers.patientName || 'Unknown'}
- Age: ${submission.age} years old
- Sex: ${submission.sex}
- Main Complaint: ${submission.complaint}
- Risk Band: ${submission.riskBand}
- Red Flags: ${(submission.redFlags as string[])?.join(', ') || 'None'}
- Summary: ${submission.summary}
- Severity: ${answers.severity || 'Not rated'}/10
- Onset: ${answers.onset || 'Not specified'}
- Location: ${answers.location || 'Not specified'}
- Medical History: ${answers.medicalHistory || 'None reported'}
- Medications: ${answers.medications || 'None'}
`;
      }
    }
    
    const queryWithContext = patientContext 
      ? `${patientContext}\n\nQUESTION ABOUT THIS PATIENT:\n${question}`
      : question;
    
    const result = await queryRAG(queryWithContext);
    res.json(result);
  });

  // Admin Portal RAG Explanation
  app.post("/api/submissions/:id/rag-explanation", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const submission = await storage.getSubmission(id);
      if (!submission) {
        return res.status(404).json({ message: "Submission not found" });
      }

      // Retrieve relevant chunks based on symptoms
      const retrievedChunks = await retrieveRelevantChunks(
        submission.complaint,
        submission.answers as Record<string, any>,
        submission.redFlags as string[]
      );

      // Generate explanation
      const explanation = await generateAdminRAGExplanation({
        patientSummary: submission.summary,
        riskBand: submission.riskBand as "Red" | "Amber" | "Green",
        triggeredRedFlags: submission.redFlags as string[],
        retrievedChunks
      });

      res.json({ explanation, retrievedChunks });
    } catch (err) {
      console.error("Error generating admin RAG explanation:", err);
      res.status(500).json({ message: "Failed to generate explanation" });
    }
  });

  // === Chat Interview Endpoints ===

  // Start a new chat session
  app.post("/api/chat/start", async (req, res) => {
    try {
      const session = await storage.createChatSession();
      const { question } = getNextQuestion({}, "opening" as Stage);
      
      const messages: ChatMessage[] = [{ role: "assistant", content: question }];
      await storage.updateChatSession(session.id, { messages, stage: "opening" });
      
      res.json({
        sessionId: session.id,
        messages,
        state: {},
        stage: "opening"
      });
    } catch (err) {
      console.error("Error starting chat:", err);
      res.status(500).json({ message: "Failed to start chat session" });
    }
  });

  // Process user message
  app.post("/api/chat/message", async (req, res) => {
    try {
      const { sessionId, message } = req.body;
      
      if (!sessionId || !message) {
        return res.status(400).json({ message: "Missing sessionId or message" });
      }
      
      const session = await storage.getChatSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      if (session.status !== "active") {
        return res.status(400).json({ message: "Session is no longer active" });
      }
      
      // Clone to avoid mutating stored references
      const currentMessages = [...(session.messages as ChatMessage[])];
      const currentState = { ...(session.state as ChatState) };
      const currentStage = session.stage as Stage;
      const currentRetryCount = session.retryCount || 0;
      
      // Add user message
      currentMessages.push({ role: "user", content: message });
      
      // Process and get response
      let result = await processUserMessage(message, currentMessages, currentState, currentStage, currentRetryCount);
      
      // Handle RAG-guided follow-up questions
      if (result.newStage === "rag_followup" && result.response === "") {
        // Get RAG context based on symptoms
        const searchQuery = `${result.newState.complaint || ''} ${result.newState.location || ''} ${result.newState.openingDescription || ''}`.trim();
        const allChunks = await storage.getAllChunks();
        
        // Simple keyword matching for context
        const keywords = searchQuery.toLowerCase().split(/\W+/).filter(w => w.length > 3);
        const matchedChunks = allChunks.filter(chunk => {
          const text = chunk.chunkText.toLowerCase();
          return keywords.some(k => text.includes(k));
        }).slice(0, 3);
        
        const ragContext = matchedChunks.map(c => c.chunkText).join("\n\n");
        
        // Generate RAG-guided question
        const ragQuestion = await generateRAGQuestion(result.newState, ragContext);
        
        if (ragQuestion) {
          result.response = ragQuestion;
        } else {
          // Skip RAG if no relevant documents, move to context questions
          result.newStage = "context_conditions" as Stage;
          // Use LLM to generate response for next stage
          const nextQ = getNextQuestion(result.newState, result.newStage);
          // Use the LLM to generate a natural response for the next stage
          const { question } = getNextQuestion(result.newState, result.newStage);
          result.response = question;
        }
      }
      
      // Add assistant response
      if (result.response) {
        currentMessages.push({ role: "assistant", content: result.response });
      }
      
      // Update session
      const newStatus = result.isEscalation ? "escalated" : (result.isComplete ? "completed" : "active");
      await storage.updateChatSession(sessionId, {
        messages: currentMessages,
        state: result.newState,
        stage: result.newStage,
        status: newStatus,
        retryCount: result.newRetryCount
      });
      
      // Auto-submit when complete (including escalations)
      let submissionId = null;
      if (result.isComplete) {
        const triageResult = buildTriageFromChat(result.newState);
        const existingCases = await storage.getSubmissions();
        const caseNumber = existingCases.length + 1;
        const patientName = result.newState.patientName || 'Patient';
        const patientAge = result.newState.age || 0;
        
        // Escalated cases are always Red
        const riskBand = result.isEscalation ? "Red" : triageResult.riskBand;
        const redFlags = result.isEscalation 
          ? [...(triageResult.redFlags || []), "Emergency escalation triggered"]
          : triageResult.redFlags;
        
        // Extract facts and evaluate red flags (deterministic-first, then LLM with validation)
        const sidNum = Number(sessionId);
        const facts = await extractFactsFromMessages(currentMessages, result.newState, {
          sessionId: sidNum,
          onDivergence: (sid, k, l, s) => void storage.recordExtractionDivergence(sid ?? null, k, l, s),
        });
        const redFlagResults = evaluateRedFlags(facts);
        
        // Generate handoff
        const handoff = await generateHandoff(
          sessionId,
          result.newState,
          currentMessages,
          redFlagResults.triggered,
          redFlagResults.notTriggered,
          redFlagResults.notAssessed
        );
        
        const submission = await storage.createSubmission({
          age: patientAge,
          sex: result.newState.sex || "Unknown",
          complaint: result.newState.complaint || result.newState.openingDescription || "Unknown",
          answers: { ...result.newState, patientName: patientName },
          riskBand: riskBand,
          redFlags: redFlags,
          summary: handoff.summary_for_reception || `Case #${caseNumber} - ${patientName} (Age ${patientAge}): ${triageResult.summary}`,
          rulesVersion: "0.1.0",
          modelVersion: "chat-v1"
        });
        
        submissionId = submission.id;
        
        // Update session with handoff data
        await storage.updateChatSession(sessionId, {
          submissionId: submission.id,
          handoffJson: handoff,
          summaryText: handoff.summary_for_reception,
          rulesSeverity: handoff.severity.rules_engine_category,
          aiSuggestedSeverity: handoff.severity.ai_suggested_category,
          aiConfidence: handoff.severity.ai_confidence
        });
      }
      
      // Get riskBand if submission was created
      let riskBand = null;
      if (submissionId) {
        const triageResult = buildTriageFromChat(result.newState);
        riskBand = triageResult.riskBand;
      }
      
      res.json({
        sessionId,
        messages: currentMessages,
        state: result.newState,
        stage: result.newStage,
        status: newStatus,
        isComplete: result.isComplete,
        isEscalation: result.isEscalation,
        submissionId,
        riskBand
      });
    } catch (err) {
      console.error("Error processing message:", err);
      res.status(500).json({ message: "Failed to process message" });
    }
  });

  // Finish and save submission
  app.post("/api/chat/finish", async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      const session = await storage.getChatSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      const state = session.state as ChatState;
      const messages = (session.messages || []) as ChatMessage[];
      const sid = Number(sessionId);
      // Extract facts and evaluate red flags
      const facts = await extractFactsFromMessages(messages, state, {
        sessionId: sid,
        onDivergence: (s, k, l, sVal) => void storage.recordExtractionDivergence(s ?? null, k, l, sVal),
      });
      const redFlagResults = evaluateRedFlags(facts);
      
      // Generate handoff
      const handoff = await generateHandoff(
        sid,
        state,
        messages,
        redFlagResults.triggered,
        redFlagResults.notTriggered,
        redFlagResults.notAssessed
      );
      
      // Build triage result from chat state
      const triageResult = buildTriageFromChat(state);
      const existingCases = await storage.getSubmissions();
      const caseNumber = existingCases.length + 1;
      const patientName = state.patientName || 'Patient';
      const patientAge = state.age || 0;
      
      // Create submission
      const submission = await storage.createSubmission({
        age: patientAge,
        sex: state.sex || "Unknown",
        complaint: state.complaint || "Unknown",
        answers: state,
        riskBand: triageResult.riskBand,
        redFlags: triageResult.redFlags,
        summary: handoff.summary_for_reception || `Case #${caseNumber} - ${patientName} (Age ${patientAge}): ${triageResult.summary}`,
        rulesVersion: "0.1.0",
        modelVersion: "chat-v1"
      });
      
      // Update session with submission link and handoff
      await storage.updateChatSession(sessionId, {
        status: "completed",
        submissionId: submission.id,
        handoffJson: handoff,
        summaryText: handoff.summary_for_reception,
        rulesSeverity: handoff.severity.rules_engine_category,
        aiSuggestedSeverity: handoff.severity.ai_suggested_category,
        aiConfidence: handoff.severity.ai_confidence
      });
      
      res.json({
        submissionId: submission.id,
        riskBand: triageResult.riskBand,
        redFlags: triageResult.redFlags,
        summary: handoff.summary_for_reception,
        recommendations: (triageResult as any).recommendations || [],
        handoff: handoff
      });
    } catch (err) {
      console.error("Error finishing chat:", err);
      res.status(500).json({ message: "Failed to finish chat session" });
    }
  });

  // Get handoff for a session
  app.get("/api/triage/session/:sessionId/handoff", async (req, res) => {
    try {
      const sessionId = Number(req.params.sessionId);
      const session = await storage.getChatSession(sessionId);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      if (session.handoffJson) {
        return res.json(session.handoffJson);
      }
      
      // Generate handoff if not exists
      const state = session.state as ChatState;
      const messages = (session.messages || []) as ChatMessage[];
      const facts = await extractFactsFromMessages(messages, state, {
        sessionId,
        onDivergence: (s, k, l, sVal) => void storage.recordExtractionDivergence(s ?? null, k, l, sVal),
      });
      const redFlagResults = evaluateRedFlags(facts);
      
      const handoff = await generateHandoff(
        sessionId,
        state,
        messages,
        redFlagResults.triggered,
        redFlagResults.notTriggered,
        redFlagResults.notAssessed
      );
      
      // Save handoff
      await storage.updateChatSession(sessionId, {
        handoffJson: handoff,
        summaryText: handoff.summary_for_reception,
        rulesSeverity: handoff.severity.rules_engine_category,
        aiSuggestedSeverity: handoff.severity.ai_suggested_category,
        aiConfidence: handoff.severity.ai_confidence
      });
      
      res.json(handoff);
    } catch (err) {
      console.error("Error getting handoff:", err);
      res.status(500).json({ message: "Failed to get handoff" });
    }
  });

  // Get summary for reception
  app.get("/api/triage/session/:sessionId/summary", async (req, res) => {
    try {
      const sessionId = Number(req.params.sessionId);
      const session = await storage.getChatSession(sessionId);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      if (session.summaryText) {
        return res.json({ summary: session.summaryText });
      }
      
      // Get from handoff if available
      if (session.handoffJson) {
        return res.json({ summary: (session.handoffJson as any).summary_for_reception });
      }
      
      res.json({ summary: "Summary not available" });
    } catch (err) {
      console.error("Error getting summary:", err);
      res.status(500).json({ message: "Failed to get summary" });
    }
  });

  // Seed Data
  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const existing = await storage.getSubmissions();
  if (existing.length === 0) {
    await storage.createSubmission({
      age: 45,
      sex: "Male",
      complaint: "Chest Pain",
      answers: {
        complaint: "Chest Pain",
        age: 45,
        sex: "Male",
        severity: 7,
        shortnessOfBreath: true,
        cardiacHistory: true
      },
      riskBand: "Red",
      redFlags: ["Chest pain + SOB", "History of heart disease"],
      summary: "45y Male presenting with Chest Pain (Severity 7/10). Risk: Red. Flags: Chest pain + SOB, History of heart disease.",
      rulesVersion: "0.1.0",
      modelVersion: "gpt-5.1"
    });
    
    await storage.createSubmission({
      age: 22,
      sex: "Female",
      complaint: "Headache",
      answers: {
        complaint: "Headache",
        age: 22,
        sex: "Female",
        severity: 4,
        duration: "2 days"
      },
      riskBand: "Green",
      redFlags: [],
      summary: "22y Female presenting with Headache (Severity 4/10). Risk: Green. Flags: None.",
      rulesVersion: "0.1.0",
      modelVersion: "gpt-5.1"
    });
  }
}
