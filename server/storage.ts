import { db } from "./db";
import {
  submissions, overrides, documents, chunks, chatSessions, triageFacts, extractionDivergences,
  type Submission, type InsertSubmission,
  type Override, type InsertOverride,
  type Document, type InsertDocument,
  type Chunk,
  type ChatSession, type ChatState, type ChatMessage,
  conversations, messages // From chat model
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Submissions
  createSubmission(submission: InsertSubmission): Promise<Submission>;
  getSubmission(id: number): Promise<Submission | undefined>;
  getSubmissions(): Promise<Submission[]>;
  
  // Overrides
  createOverride(override: InsertOverride): Promise<Override>;
  getOverrides(submissionId: number): Promise<Override[]>;

  // Documents
  createDocument(doc: InsertDocument): Promise<Document>;
  getDocuments(): Promise<Document[]>;
  getDocument(id: number): Promise<Document | undefined>;
  
  // Chunks
  createChunk(chunk: typeof chunks.$inferInsert): Promise<Chunk>;
  getChunksByDocument(documentId: number): Promise<Chunk[]>;
  getAllChunks(): Promise<Chunk[]>;

  // Chat (re-export or implement if needed for the integration)
  // The integration uses 'chatStorage' directly, but we can expose it here if we want unified access
}

export class DatabaseStorage implements IStorage {
  // Submissions
  async createSubmission(submission: InsertSubmission): Promise<Submission> {
    const [result] = await db.insert(submissions).values(submission).returning();
    return result;
  }

  async getSubmission(id: number): Promise<Submission | undefined> {
    const [result] = await db.select().from(submissions).where(eq(submissions.id, id));
    return result;
  }

  async getSubmissions(): Promise<Submission[]> {
    return db.select().from(submissions).orderBy(desc(submissions.createdAt));
  }

  async getSessionIdBySubmissionId(submissionId: number): Promise<number | null> {
    const [row] = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(eq(chatSessions.submissionId, submissionId));
    return row?.id ?? null;
  }

  async updateSubmission(
    id: number,
    updates: { answers?: Record<string, any>; updatedBy?: string }
  ): Promise<Submission> {
    const [row] = await db
      .update(submissions)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, id))
      .returning();
    if (!row) throw new Error("Submission not found");
    return row;
  }

  // Overrides
  async createOverride(override: InsertOverride): Promise<Override> {
    const [result] = await db.insert(overrides).values(override).returning();
    return result;
  }

  async getOverrides(submissionId: number): Promise<Override[]> {
    return db.select().from(overrides).where(eq(overrides.submissionId, submissionId));
  }

  // Documents
  async createDocument(doc: InsertDocument): Promise<Document> {
    const [result] = await db.insert(documents).values(doc).returning();
    return result;
  }

  async getDocuments(): Promise<Document[]> {
    return db.select().from(documents).orderBy(desc(documents.uploadedAt));
  }

  async getDocument(id: number): Promise<Document | undefined> {
    const [result] = await db.select().from(documents).where(eq(documents.id, id));
    return result;
  }

  // Chunks
  async createChunk(chunk: typeof chunks.$inferInsert): Promise<Chunk> {
    const [result] = await db.insert(chunks).values(chunk).returning();
    return result;
  }

  async getChunksByDocument(documentId: number): Promise<Chunk[]> {
    return db.select().from(chunks).where(eq(chunks.documentId, documentId));
  }

  async getAllChunks(): Promise<Chunk[]> {
    return db.select().from(chunks);
  }

  // Chat Sessions
  async createChatSession(): Promise<ChatSession> {
    const [session] = await db.insert(chatSessions).values({
      messages: [],
      state: {},
      stage: "greeting",
      status: "active"
    }).returning();
    return session;
  }

  async getChatSession(id: number): Promise<ChatSession | undefined> {
    const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, id));
    return session;
  }

  async updateChatSession(id: number, updates: {
    messages?: ChatMessage[];
    state?: ChatState;
    stage?: string;
    status?: string;
    retryCount?: number;
    submissionId?: number;
    handoffJson?: any;
    summaryText?: string;
    rulesSeverity?: string;
    aiSuggestedSeverity?: string;
    aiConfidence?: string;
  }): Promise<ChatSession> {
    const updateData: any = { ...updates };
    if (Object.keys(updates).length > 0) {
      updateData.updatedAt = new Date();
    }
    const [session] = await db.update(chatSessions)
      .set(updateData)
      .where(eq(chatSessions.id, id))
      .returning();
    return session;
  }

  // Triage Facts
  async createTriageFact(fact: {
    sessionId: number;
    factKey: string;
    factValue: any;
    confidence?: number;
    source?: string;
  }): Promise<any> {
    const [result] = await db.insert(triageFacts).values({
      sessionId: fact.sessionId,
      factKey: fact.factKey,
      factValue: fact.factValue,
      confidence: fact.confidence || 80,
      source: fact.source || "patient"
    }).returning();
    return result;
  }

  async getTriageFacts(sessionId: number): Promise<any[]> {
    return db.select().from(triageFacts).where(eq(triageFacts.sessionId, sessionId));
  }

  // Metrics: chat completion and divergence (hallucination proxy)
  async getChatSessionCounts(): Promise<{ total: number; active: number; completed: number; escalated: number }> {
    const rows = await db.select({ status: chatSessions.status }).from(chatSessions);
    const total = rows.length;
    const active = rows.filter((r) => r.status === "active").length;
    const completed = rows.filter((r) => r.status === "completed").length;
    const escalated = rows.filter((r) => r.status === "escalated").length;
    return { total, active, completed, escalated };
  }

  async recordExtractionDivergence(sessionId: number | null, factKey: string, llmValue: unknown, stateValue: unknown): Promise<void> {
    await db.insert(extractionDivergences).values({
      sessionId,
      factKey,
      llmValue: llmValue as any,
      stateValue: stateValue as any,
    });
  }

  async getDivergenceMetrics(): Promise<{ divergenceCount: number; sessionsWithDivergence: number }> {
    const rows = await db.select({ sessionId: extractionDivergences.sessionId }).from(extractionDivergences);
    const divergenceCount = rows.length;
    const sessionsWithDivergence = new Set(rows.map((r) => r.sessionId).filter((id): id is number => id != null)).size;
    return { divergenceCount, sessionsWithDivergence };
  }
}

export const storage = new DatabaseStorage();
