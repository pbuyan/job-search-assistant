// src/db/schema.ts — Drizzle ORM, Postgres + pgvector
// Requires: CREATE EXTENSION IF NOT EXISTS vector;
import {
  pgTable, pgEnum, text, uuid, timestamp, integer, boolean,
  jsonb, vector, index, uniqueIndex, date,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Embedding size depends on the model you pick (e.g. voyage-3.5 = 1024,
// OpenAI text-embedding-3-small = 1536). Keep it in one place.
export const EMBEDDING_DIMS = 1024;

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow().notNull().$onUpdate(() => new Date()),
};

// ---------- Enums ----------
export const applicationStatus = pgEnum("application_status", [
  "saved", "applied", "screening", "interviewing",
  "offer", "accepted", "rejected", "withdrawn", "ghosted",
]);
export const jobSource = pgEnum("job_source", [
  "manual", "url", "greenhouse", "lever", "ashby", "aggregator",
]);
export const remoteType = pgEnum("remote_type", ["onsite", "hybrid", "remote", "unknown"]);
export const eventType = pgEnum("event_type", [
  "status_change", "note", "interview", "email", "follow_up", "offer",
]);

// ---------- Users ----------
// id = auth provider's user id (Clerk/Auth.js), stored as text.
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  locale: text("locale").default("en").notNull(), // UI language
  ...timestamps,
});

// ---------- Master profile ----------
// One per user. `data` follows the JSON Resume shape, but every bullet has a
// stable id so tailored versions can cite their source (see ProfileData type).
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<ProfileData>().notNull(),
  // Search preferences drive job matching
  targetTitles: text("target_titles").array().default(sql`'{}'`).notNull(),
  targetLocations: text("target_locations").array().default(sql`'{}'`).notNull(),
  remotePreference: remoteType("remote_preference").default("unknown").notNull(),
  minSalary: integer("min_salary"),
  salaryCurrency: text("salary_currency").default("CAD"),
  embedding: vector("embedding", { dimensions: EMBEDDING_DIMS }),
  sourceFileKey: text("source_file_key"), // private storage key of the uploaded resume
  language: text("language").default("en").notNull(), // resume language
  ...timestamps,
});

// ---------- Jobs ----------
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  source: jobSource("source").notNull(),
  externalId: text("external_id"),          // id from the board API, if any
  url: text("url"),
  company: text("company").notNull(),
  title: text("title").notNull(),
  location: text("location"),
  remote: remoteType("remote").default("unknown").notNull(),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  salaryCurrency: text("salary_currency"),
  descriptionRaw: text("description_raw").notNull(),
  requirements: jsonb("requirements").$type<ParsedRequirements>(), // AI-extracted
  embedding: vector("embedding", { dimensions: EMBEDDING_DIMS }),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  language: text("language"), // job posting language, detected
  ...timestamps,
}, (t) => [
  index("jobs_user_idx").on(t.userId),
  uniqueIndex("jobs_user_source_external_uq").on(t.userId, t.source, t.externalId),
  index("jobs_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
]);

// ---------- Fit analysis (profile vs job) ----------
// Separate table so re-analysis after a profile change keeps history.
export const jobMatches = pgTable("job_matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),                 // 0–100
  similarity: integer("similarity"),                 // vector similarity ×100, pre-LLM filter
  analysis: jsonb("analysis").$type<FitAnalysis>().notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  analysisLanguage: text("analysis_language").default("en").notNull(),
  ...timestamps,
}, (t) => [
  index("job_matches_job_idx").on(t.jobId),
  index("job_matches_user_score_idx").on(t.userId, t.score),
]);

// ---------- Tailored resume versions ----------
export const resumeVersions = pgTable("resume_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  name: text("name").notNull(),                       // "Shopify – Senior FE"
  data: jsonb("data").$type<TailoredResume>().notNull(),
  isAiGenerated: boolean("is_ai_generated").default(false).notNull(),
  model: text("model"),
  promptVersion: text("prompt_version"),
  exportedFileKey: text("exported_file_key"),         // PDF/DOCX actually sent
  language: text("language").default("en").notNull(), // resume language
  ...timestamps,
}, (t) => [index("resume_versions_user_idx").on(t.userId)]);

// ---------- Applications (tracker) ----------
export const applications = pgTable("applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  resumeVersionId: uuid("resume_version_id").references(() => resumeVersions.id, { onDelete: "set null" }),
  status: applicationStatus("status").default("saved").notNull(),
  boardPosition: integer("board_position").default(0).notNull(), // kanban order within column
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  nextStep: text("next_step"),
  nextStepDue: date("next_step_due"),
  coverLetter: text("cover_letter"),
  notes: text("notes"),
  ...timestamps,
}, (t) => [
  uniqueIndex("applications_user_job_uq").on(t.userId, t.jobId),
  index("applications_user_status_idx").on(t.userId, t.status),
  index("applications_next_step_idx").on(t.userId, t.nextStepDue),
]);

// ---------- Timeline (status history, interviews, notes) ----------
export const applicationEvents = pgTable("application_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  type: eventType("type").notNull(),
  fromStatus: applicationStatus("from_status"),
  toStatus: applicationStatus("to_status"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  title: text("title"),
  body: text("body"),
  meta: jsonb("meta").$type<Record<string, unknown>>(), // e.g. interviewers, meeting link
  createdAt: timestamps.createdAt,
}, (t) => [index("application_events_app_idx").on(t.applicationId, t.occurredAt)]);

// ---------- Contacts ----------
export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  role: text("role"),            // recruiter, hiring manager, referrer
  email: text("email"),
  linkedinUrl: text("linkedin_url"),
  notes: text("notes"),
  ...timestamps,
}, (t) => [index("contacts_user_idx").on(t.userId)]);

// ---------- JSONB types (mirror these as Zod schemas in src/prompts) ----------
export type Bullet = { id: string; text: string; skills?: string[] };

export type ProfileData = {
  basics: { name: string; label?: string; email?: string; phone?: string;
            location?: string; summary?: string; links?: { label: string; url: string }[] };
  work: { id: string; company: string; position: string; startDate: string;
          endDate?: string; location?: string; bullets: Bullet[] }[];
  projects?: { id: string; name: string; url?: string; bullets: Bullet[] }[];
  education?: { institution: string; area?: string; studyType?: string;
                startDate?: string; endDate?: string }[];
  skills: { category: string; items: string[] }[];
  certifications?: { name: string; issuer?: string; date?: string }[];
  languages?: { language: string; fluency?: string }[];
};

export type ParsedRequirements = {
  mustHave: string[];
  niceToHave: string[];
  seniority?: "junior" | "mid" | "senior" | "staff" | "lead" | "principal";
  yearsExperience?: number;
  techStack: string[];
  responsibilities: string[];
};

export type FitAnalysis = {
  summary: string;
  matched: { requirement: string; evidenceBulletIds: string[] }[];
  gaps: { requirement: string; severity: "minor" | "major"; suggestion?: string }[];
  keywordsToEmphasize: string[];
};

// Tailored bullets must cite a master bullet — enforced in code, not just prompt.
export type TailoredBullet = { text: string; sourceBulletId: string };
export type TailoredResume = Omit<ProfileData, "work" | "projects"> & {
  work: { sourceWorkId: string; company: string; position: string; startDate: string;
          endDate?: string; bullets: TailoredBullet[] }[];
  projects?: { sourceProjectId: string; name: string; bullets: TailoredBullet[] }[];
};
