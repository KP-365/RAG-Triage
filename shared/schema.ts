import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// === INTEGRATION EXPORTS ===
export * from "./models/chat";

// === TABLE DEFINITIONS ===

// Patient Submissions
export const submissions = pgTable("submissions", {
  id: serial("id").primaryKey(),
  age: integer("age").notNull(),
  sex: text("sex").notNull(), // 'Male', 'Female', 'Other'
  complaint: text("complaint").notNull(),
  answers: jsonb("answers").notNull(), // Structured answers from the form
  riskBand: text("risk_band").notNull(), // 'Red', 'Amber', 'Green'
  redFlags: jsonb("red_flags").notNull(), // Array of triggered flags
  summary: text("summary").notNull(),
  rulesVersion: text("rules_version").notNull(),
  modelVersion: text("model_version").notNull(),
  status: text("status").default("pending").notNull(), // pending, reviewed
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
  updatedBy: text("updated_by"), // Admin name when edits are made (e.g. patient name)
});

// Clinician Decision Log
export const overrides = pgTable("overrides", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id").notNull(),
  originalBand: text("original_band"), // AI-suggested level before clinician decision
  overrideBand: text("override_band").notNull(), // Clinician-confirmed level
  decisionType: text("decision_type").default("accepted"), // "accepted", "modified", "overridden"
  note: text("note").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Knowledge Base Documents
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  source: text("source").notNull(), // e.g. 'NICE Guidelines'
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

// Document Chunks (for RAG)
export const chunks = pgTable("chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  chunkText: text("chunk_text").notNull(),
  metadata: jsonb("metadata").notNull(), // Page number, section, etc.
  embedding: jsonb("embedding").notNull(), // Vector array stored as JSON
});

// Chat Sessions for guided triage interview
export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  messages: jsonb("messages").notNull().default([]), // Array of {role, content}
  state: jsonb("state").notNull().default({}), // Extracted structured data
  stage: text("stage").notNull().default("greeting"), // Current interview stage
  status: text("status").notNull().default("active"), // active, completed, escalated
  retryCount: integer("retry_count").notNull().default(0), // Track failed parsing attempts
  submissionId: integer("submission_id"), // Link to final submission if completed
  handoffJson: jsonb("handoff_json"), // Receptionist handoff JSON
  summaryText: text("summary_text"), // Short receptionist summary
  rulesSeverity: text("rules_severity"), // GREEN|AMBER|RED from rules engine
  aiSuggestedSeverity: text("ai_suggested_severity"), // GREEN|AMBER|RED from AI
  aiConfidence: text("ai_confidence"), // LOW|MEDIUM|HIGH
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Structured facts extracted from conversation
export const triageFacts = pgTable("triage_facts", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  factKey: text("fact_key").notNull(), // e.g. onset, duration, chest_pain, sob, fever
  factValue: jsonb("fact_value").notNull(), // store as JSON for flexibility
  confidence: integer("confidence").notNull().default(80), // 0-100
  source: text("source").notNull().default("patient"), // patient|derived|model
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Extraction divergences (LLM fact ≠ deterministic state) for hallucination metrics
export const extractionDivergences = pgTable("extraction_divergences", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => chatSessions.id, { onDelete: "cascade" }),
  factKey: text("fact_key").notNull(),
  llmValue: jsonb("llm_value").notNull(),
  stateValue: jsonb("state_value").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// === RELATIONS ===
export const submissionsRelations = relations(submissions, ({ many }) => ({
  overrides: many(overrides),
}));

export const overridesRelations = relations(overrides, ({ one }) => ({
  submission: one(submissions, {
    fields: [overrides.submissionId],
    references: [submissions.id],
  }),
}));

export const documentsRelations = relations(documents, ({ many }) => ({
  chunks: many(chunks),
}));

export const chunksRelations = relations(chunks, ({ one }) => ({
  document: one(documents, {
    fields: [chunks.documentId],
    references: [documents.id],
  }),
}));

export const chatSessionsRelations = relations(chatSessions, ({ many }) => ({
  triageFacts: many(triageFacts),
}));

export const triageFactsRelations = relations(triageFacts, ({ one }) => ({
  session: one(chatSessions, {
    fields: [triageFacts.sessionId],
    references: [chatSessions.id],
  }),
}));

// === ZOD SCHEMAS ===
export const insertSubmissionSchema = createInsertSchema(submissions).omit({ 
  id: true, 
  createdAt: true, 
  status: true 
});

export const insertOverrideSchema = createInsertSchema(overrides).omit({ 
  id: true, 
  createdAt: true 
});

export const insertDocumentSchema = createInsertSchema(documents).omit({ 
  id: true, 
  uploadedAt: true 
});

// === TYPES ===
export type Submission = typeof submissions.$inferSelect;
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;

export type Override = typeof overrides.$inferSelect;
export type InsertOverride = z.infer<typeof insertOverrideSchema>;

export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

export type Chunk = typeof chunks.$inferSelect;

export type ChatSession = typeof chatSessions.$inferSelect;

// Chat state structure
export interface ChatState {
  name?: string;
  dateOfBirth?: string;
  age?: number;
  sex?: string;
  complaint?: string;
  onset?: string;
  severity?: number;
  shortnessOfBreath?: boolean;
  collapse?: boolean;
  radiatingPain?: boolean;
  sweating?: boolean;
  confusion?: boolean;
  severeBleeding?: boolean;
  [key: string]: any;
}

export interface ChatMessage {
  role: "assistant" | "user";
  content: string;
}
