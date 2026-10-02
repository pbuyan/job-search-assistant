ALTER TABLE "job_matches" ADD COLUMN "analysis_language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD COLUMN "language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;