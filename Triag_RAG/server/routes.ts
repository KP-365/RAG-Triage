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
    res.json({ ...submission, overrides });
  });

  app.post(api.submissions.override.path, async (req, res) => {
    const id = Number(req.params.id);
    const input = api.submissions.override.input.parse(req.body);
    const override = await storage.createOverride({ ...input, submissionId: id });
    res.status(201).json(override);
  });

  // Docs API
  app.get(api.documents.list.path, async (req, res) => {
    const list = await storage.getDocuments();
    res.json(list);
  });

  app.post(api.documents.upload.path, upload.single('file'), async (req, res) => {
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

  // RAG Query
  app.post(api.rag.query.path, async (req, res) => {
    const { question, submissionId } = req.body;
    const result = await queryRAG(question);
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
      
      // Auto-submit when complete
      let submissionId = null;
      if (result.isComplete && !result.isEscalation) {
        const triageResult = buildTriageFromChat(result.newState);
        const submission = await storage.createSubmission({
          age: result.newState.age || 0,
          sex: result.newState.sex || "Unknown",
          complaint: result.newState.complaint || "Unknown",
          answers: { ...result.newState, patientName: result.newState.patientName },
          riskBand: triageResult.riskBand,
          redFlags: triageResult.redFlags,
          summary: `${result.newState.patientName || 'Patient'}: ${triageResult.summary}`,
          rulesVersion: "0.1.0",
          modelVersion: "chat-v1"
        });
        
        submissionId = submission.id;
        await storage.updateChatSession(sessionId, { submissionId: submission.id });
      }
      
      res.json({
        sessionId,
        messages: currentMessages,
        state: result.newState,
        stage: result.newStage,
        status: newStatus,
        isComplete: result.isComplete,
        isEscalation: result.isEscalation,
        submissionId
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
      
      // Build triage result from chat state
      const triageResult = buildTriageFromChat(state);
      
      // Create submission
      const submission = await storage.createSubmission({
        age: state.age || 0,
        sex: state.sex || "Unknown",
        complaint: state.complaint || "Unknown",
        answers: state,
        riskBand: triageResult.riskBand,
        redFlags: triageResult.redFlags,
        summary: triageResult.summary,
        rulesVersion: "0.1.0",
        modelVersion: "chat-v1"
      });
      
      // Update session with submission link
      await storage.updateChatSession(sessionId, {
        status: "completed",
        submissionId: submission.id
      });
      
      res.json({
        submissionId: submission.id,
        riskBand: triageResult.riskBand,
        redFlags: triageResult.redFlags,
        summary: triageResult.summary,
        recommendations: (triageResult as any).recommendations || []
      });
    } catch (err) {
      console.error("Error finishing chat:", err);
      res.status(500).json({ message: "Failed to finish chat session" });
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
