CREATE TYPE "public"."analysis_status" AS ENUM('parsing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ats_rating" AS ENUM('High', 'Medium', 'Low');--> statement-breakpoint
CREATE TYPE "public"."bullet_scope" AS ENUM('work', 'project', 'volunteer', 'education');--> statement-breakpoint
CREATE TYPE "public"."course_level" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."coverage_status" AS ENUM('evidenced', 'partial', 'absent');--> statement-breakpoint
CREATE TYPE "public"."export_format" AS ENUM('pdf', 'docx', 'zip');--> statement-breakpoint
CREATE TYPE "public"."extraction_status" AS ENUM('pending', 'ok', 'no_text_layer', 'encrypted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."jd_source" AS ENUM('paste', 'upload');--> statement-breakpoint
CREATE TYPE "public"."necessity" AS ENUM('required', 'preferred', 'implied');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('behavioral', 'technical', 'situational', 'gap', 'culture');--> statement-breakpoint
CREATE TYPE "public"."required_level" AS ENUM('exposure', 'working', 'strong', 'expert');--> statement-breakpoint
CREATE TYPE "public"."requirement_kind" AS ENUM('hard_skill', 'soft_skill', 'experience', 'education', 'certification', 'responsibility');--> statement-breakpoint
CREATE TYPE "public"."template_kind" AS ENUM('classic', 'sidebar', 'creative');--> statement-breakpoint
CREATE TYPE "public"."transform_kind" AS ENUM('verbatim', 'rephrase', 'requantify', 'omit');--> statement-breakpoint
CREATE TYPE "public"."user_level" AS ENUM('none', 'exposure', 'working', 'strong');--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"analysis_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"schema_valid" boolean NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"profile_id" uuid NOT NULL,
	"jd_source" "jd_source" NOT NULL,
	"jd_filename" text,
	"raw_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"company" text,
	"title" text,
	"location" text,
	"seniority" text,
	"employment_type" text,
	"score" numeric(5, 2),
	"score_verdict" text,
	"score_note" text,
	"status" "analysis_status" DEFAULT 'parsing' NOT NULL,
	"stage_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analyses_user_content_hash" UNIQUE("clerk_user_id","content_hash")
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"price_label" text NOT NULL,
	"length_label" text NOT NULL,
	"level" "course_level" NOT NULL,
	"mark" text NOT NULL,
	"skill_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"is_free" boolean NOT NULL,
	"length_minutes" integer NOT NULL,
	"verified_at" date NOT NULL,
	CONSTRAINT "courses_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "coverage_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"analysis_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"status" "coverage_status" NOT NULL,
	"evidence_bullet_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"rationale" text NOT NULL,
	CONSTRAINT "coverage_items_evidenced_has_evidence" CHECK ("coverage_items"."status" <> 'evidenced' OR array_length("coverage_items"."evidence_bullet_ids", 1) > 0)
);
--> statement-breakpoint
CREATE TABLE "experience_bullets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"profile_id" uuid NOT NULL,
	"scope" "bullet_scope" NOT NULL,
	"scope_ref" text NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	"skill_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recency_months" integer
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"analysis_id" uuid NOT NULL,
	"draft_id" uuid,
	"format" "export_format" NOT NULL,
	"storage_path" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"analysis_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"type" "question_type" NOT NULL,
	"text" text NOT NULL,
	"likely" boolean DEFAULT false NOT NULL,
	"why_they_ask" text NOT NULL,
	"frame" text[] NOT NULL,
	"evidence_bullet_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"source_requirement_id" uuid,
	CONSTRAINT "interview_questions_evidence_or_gap" CHECK ("interview_questions"."type" = 'gap' OR array_length("interview_questions"."evidence_bullet_ids", 1) > 0)
);
--> statement-breakpoint
CREATE TABLE "jd_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"analysis_id" uuid NOT NULL,
	"kind" "requirement_kind" NOT NULL,
	"text" text NOT NULL,
	"necessity" "necessity" NOT NULL,
	"mention_count" integer DEFAULT 1 NOT NULL,
	"skill_id" uuid,
	"evidence_quote" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"resume_json" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"source_document_id" uuid,
	"years_experience" numeric(4, 1) DEFAULT '0' NOT NULL,
	"skill_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"analysis_id" uuid NOT NULL,
	"template_id" text NOT NULL,
	"resume_json" jsonb NOT NULL,
	"ats_rating" "ats_rating" NOT NULL,
	"page_count" integer DEFAULT 1 NOT NULL,
	"changes" text[] DEFAULT '{}'::text[] NOT NULL,
	"missing" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resume_drafts_analysis_template" UNIQUE("analysis_id","template_id")
);
--> statement-breakpoint
CREATE TABLE "skill_gaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"analysis_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"user_level" "user_level" NOT NULL,
	"required_level" "required_level" NOT NULL,
	"mention_count" integer DEFAULT 1 NOT NULL,
	"note" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "skills_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"storage_path" text NOT NULL,
	"bucket" text NOT NULL,
	"mime" text NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"extraction_status" "extraction_status" DEFAULT 'pending' NOT NULL,
	"extracted_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tailored_bullets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"draft_id" uuid NOT NULL,
	"source_bullet_id" uuid NOT NULL,
	"original_text" text NOT NULL,
	"rewritten_text" text NOT NULL,
	"transform" "transform_kind" NOT NULL,
	"targets_requirement_id" uuid,
	"ai_run_id" uuid,
	"ordinal" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "template_kind" NOT NULL,
	"blurb" text NOT NULL,
	"accent" text NOT NULL,
	"structural_flags" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"clerk_user_id" text PRIMARY KEY NOT NULL,
	"email_hash" text NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"quota_remaining" integer DEFAULT 10 NOT NULL,
	"quota_resets_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_profile_id_master_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."master_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_items" ADD CONSTRAINT "coverage_items_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_items" ADD CONSTRAINT "coverage_items_requirement_id_jd_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."jd_requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_bullets" ADD CONSTRAINT "experience_bullets_profile_id_master_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."master_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_draft_id_resume_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."resume_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_source_requirement_id_jd_requirements_id_fk" FOREIGN KEY ("source_requirement_id") REFERENCES "public"."jd_requirements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jd_requirements" ADD CONSTRAINT "jd_requirements_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jd_requirements" ADD CONSTRAINT "jd_requirements_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_profiles" ADD CONSTRAINT "master_profiles_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_drafts" ADD CONSTRAINT "resume_drafts_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_drafts" ADD CONSTRAINT "resume_drafts_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_gaps" ADD CONSTRAINT "skill_gaps_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_gaps" ADD CONSTRAINT "skill_gaps_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailored_bullets" ADD CONSTRAINT "tailored_bullets_draft_id_resume_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."resume_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailored_bullets" ADD CONSTRAINT "tailored_bullets_source_bullet_id_experience_bullets_id_fk" FOREIGN KEY ("source_bullet_id") REFERENCES "public"."experience_bullets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailored_bullets" ADD CONSTRAINT "tailored_bullets_targets_requirement_id_jd_requirements_id_fk" FOREIGN KEY ("targets_requirement_id") REFERENCES "public"."jd_requirements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailored_bullets" ADD CONSTRAINT "tailored_bullets_ai_run_id_ai_runs_id_fk" FOREIGN KEY ("ai_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_runs_user_created_idx" ON "ai_runs" USING btree ("clerk_user_id","created_at");--> statement-breakpoint
CREATE INDEX "analyses_user_created_idx" ON "analyses" USING btree ("clerk_user_id","created_at");--> statement-breakpoint
CREATE INDEX "coverage_items_analysis_idx" ON "coverage_items" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "experience_bullets_profile_idx" ON "experience_bullets" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "experience_bullets_user_idx" ON "experience_bullets" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "exports_user_idx" ON "exports" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "interview_questions_analysis_idx" ON "interview_questions" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "jd_requirements_analysis_idx" ON "jd_requirements" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "master_profiles_user_idx" ON "master_profiles" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "resume_drafts_analysis_idx" ON "resume_drafts" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "skill_gaps_analysis_idx" ON "skill_gaps" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "skills_name_idx" ON "skills" USING btree ("name");--> statement-breakpoint
CREATE INDEX "source_documents_user_idx" ON "source_documents" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "tailored_bullets_draft_idx" ON "tailored_bullets" USING btree ("draft_id");