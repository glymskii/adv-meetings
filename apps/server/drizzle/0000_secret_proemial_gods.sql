CREATE TYPE "public"."audio_kind" AS ENUM('segment', 'merged', 'import');--> statement-breakpoint
CREATE TYPE "public"."confidentiality" AS ENUM('standard', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."meeting_source" AS ENUM('recorded', 'imported');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('recording', 'uploading', 'queued', 'processing', 'transcribing', 'summarizing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."share_scope" AS ENUM('report', 'report_transcript');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"agency_id" text,
	"role" text DEFAULT 'member' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email_domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"keyterms" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audio_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"kind" "audio_kind" NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text DEFAULT 'audio/mp4' NOT NULL,
	"size_bytes" integer,
	"duration_sec" numeric(10, 3),
	"uploaded_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"push_token" text NOT NULL,
	"app_version" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"group" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"goal" text NOT NULL,
	"report_title" text NOT NULL,
	"emoji" text NOT NULL,
	"color" text NOT NULL,
	"confidentiality" "confidentiality" DEFAULT 'standard' NOT NULL,
	"allow_confidentiality_choice" boolean DEFAULT false NOT NULL,
	"sla_hours" integer DEFAULT 24 NOT NULL,
	"send_to" text,
	"tone" text,
	"common_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"specific_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"report_sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rules" text[] DEFAULT '{}'::text[] NOT NULL,
	"tips" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"agency_id" text,
	"template_id" uuid NOT NULL,
	"template_code" text NOT NULL,
	"template_version" integer NOT NULL,
	"title" text NOT NULL,
	"status" "meeting_status" DEFAULT 'recording' NOT NULL,
	"status_detail" text,
	"error" text,
	"source" "meeting_source" DEFAULT 'recorded' NOT NULL,
	"confidentiality" "confidentiality" DEFAULT 'standard' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_sec" integer,
	"context_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"participants_hint" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"num_speakers_hint" integer,
	"language_hint" text,
	"platform" text,
	"markers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"segment_count" integer DEFAULT 0 NOT NULL,
	"device_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"template_id" uuid NOT NULL,
	"template_code" text NOT NULL,
	"template_version" integer NOT NULL,
	"model" text NOT NULL,
	"effort" text,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"action_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open_questions" text[] DEFAULT '{}'::text[] NOT NULL,
	"client_requests" text[] DEFAULT '{}'::text[] NOT NULL,
	"missing_info" text[] DEFAULT '{}'::text[] NOT NULL,
	"next_meeting" jsonb,
	"markdown" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"cost_usd" numeric(10, 4),
	"created_by" text DEFAULT 'pipeline' NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_user_id" text,
	"scope" "share_scope" DEFAULT 'report' NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_request_id" text,
	"language_code" text,
	"language_probability" numeric(5, 4),
	"full_text" text NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"speakers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"audio_duration_sec" numeric(10, 3),
	"word_count" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcripts_meeting_id_unique" UNIQUE("meeting_id")
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid,
	"user_id" text,
	"agency_id" text,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"amount" numeric(14, 3) NOT NULL,
	"unit" text NOT NULL,
	"cost_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_objects" ADD CONSTRAINT "audio_objects_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_template_id_meeting_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."meeting_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_template_id_meeting_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."meeting_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_agency_idx" ON "user" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "audio_objects_meeting_kind_seq_idx" ON "audio_objects" USING btree ("meeting_id","kind","seq");--> statement-breakpoint
CREATE INDEX "audio_objects_pending_idx" ON "audio_objects" USING btree ("deleted_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_token_idx" ON "devices" USING btree ("push_token");--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_templates_code_version_idx" ON "meeting_templates" USING btree ("code","version");--> statement-breakpoint
CREATE INDEX "meetings_owner_idx" ON "meetings" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "meetings_agency_idx" ON "meetings" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "meetings_status_idx" ON "meetings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_meeting_version_idx" ON "reports" USING btree ("meeting_id","version");--> statement-breakpoint
CREATE INDEX "shares_recipient_idx" ON "shares" USING btree ("recipient_email");--> statement-breakpoint
CREATE INDEX "shares_meeting_idx" ON "shares" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "usage_events_agency_idx" ON "usage_events" USING btree ("agency_id","created_at");