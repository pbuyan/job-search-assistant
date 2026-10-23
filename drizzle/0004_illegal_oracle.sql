CREATE TYPE "public"."ai_feature" AS ENUM('parseResume', 'parseJob', 'fitAnalysis', 'tailorResume', 'translateResume', 'embedProfile');--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"user_id" text NOT NULL,
	"feature" "ai_feature" NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_user_feature_day_uq" ON "ai_usage" USING btree ("user_id","feature","day");