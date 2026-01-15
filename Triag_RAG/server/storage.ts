import { db } from "./db";
import {
  submissions, overrides, documents, chunks, chatSessions,
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
  }): Promise<ChatSession> {
    const [session] = await db.update(chatSessions)
      .set(updates)
      .where(eq(chatSessions.id, id))
      .returning();
    return session;
  }
}

export const storage = new DatabaseStorage();
