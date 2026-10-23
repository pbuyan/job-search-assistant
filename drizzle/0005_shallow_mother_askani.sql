ALTER TYPE "public"."ai_feature" ADD VALUE 'coverLetter';--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "cover_letter_model" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "cover_letter_prompt_version" text;