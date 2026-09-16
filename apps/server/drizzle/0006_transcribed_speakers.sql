ALTER TYPE "public"."meeting_status" ADD VALUE 'transcribed' BEFORE 'summarizing';--> statement-breakpoint
ALTER TABLE "transcripts" ADD COLUMN "speaker_suggestions" jsonb;--> statement-breakpoint
ALTER TABLE "transcripts" ADD COLUMN "speakers_confirmed_at" timestamp with time zone;