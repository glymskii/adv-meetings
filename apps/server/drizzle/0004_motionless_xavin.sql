ALTER TABLE "reports" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "edited_by" text;