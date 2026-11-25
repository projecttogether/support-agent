CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
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
CREATE TABLE "auth_rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "auth_rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'editor' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sign_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_channels" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"channel_name" text
);
--> statement-breakpoint
CREATE TABLE "agent_knowledge_sources" (
	"agent_id" uuid NOT NULL,
	"knowledge_source_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "agent_knowledge_sources_agent_id_knowledge_source_id_pk" PRIMARY KEY("agent_id","knowledge_source_id")
);
--> statement-breakpoint
CREATE TABLE "agent_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"question" text NOT NULL,
	"expectation" text NOT NULL,
	"expected_url" text,
	"last_run_at" timestamp with time zone,
	"last_passed" boolean,
	"last_outcome" text,
	"last_answer" text,
	"last_failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"provider_id" uuid,
	"model" text DEFAULT '' NOT NULL,
	"fallback_provider_id" uuid,
	"fallback_model" text,
	"reply_mode" text DEFAULT 'questions' NOT NULL,
	"follow_ups_in_threads" boolean DEFAULT false NOT NULL,
	"no_answer_mode" text DEFAULT 'escalate' NOT NULL,
	"escalation_message" text DEFAULT '' NOT NULL,
	"display_name" text,
	"icon_url" text,
	"read_images" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_status" (
	"instance_id" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"version" text,
	"started_at" timestamp with time zone NOT NULL,
	"connected_since" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone NOT NULL,
	"last_event_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exchanges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"agent_name" text,
	"channel_id" text NOT NULL,
	"channel_name" text,
	"slack_user_id" text,
	"message_ts" text NOT NULL,
	"thread_ts" text,
	"answer_ts" text,
	"question" text,
	"answer" text,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"search_queries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" text,
	"model" text,
	"used_fallback" boolean DEFAULT false NOT NULL,
	"error" text,
	"feedback" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"text_removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text NOT NULL,
	"config" jsonb NOT NULL,
	"secret_encrypted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"base_url" text,
	"api_key_encrypted" text,
	"api_key_hint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_channels" ADD CONSTRAINT "agent_channels_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_knowledge_sources" ADD CONSTRAINT "agent_knowledge_sources_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_knowledge_sources" ADD CONSTRAINT "agent_knowledge_sources_knowledge_source_id_knowledge_sources_id_fk" FOREIGN KEY ("knowledge_source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tests" ADD CONSTRAINT "agent_tests_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_fallback_provider_id_providers_id_fk" FOREIGN KEY ("fallback_provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchanges" ADD CONSTRAINT "exchanges_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_user" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_verifications_identifier" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "idx_agent_channels_agent" ON "agent_channels" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_knowledge_sources_source" ON "agent_knowledge_sources" USING btree ("knowledge_source_id");--> statement-breakpoint
CREATE INDEX "idx_agent_tests_agent" ON "agent_tests" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_audit_log_created" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_exchanges_message" ON "exchanges" USING btree ("channel_id","message_ts");--> statement-breakpoint
CREATE INDEX "idx_exchanges_created" ON "exchanges" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_exchanges_agent" ON "exchanges" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_exchanges_thread" ON "exchanges" USING btree ("channel_id","thread_ts");--> statement-breakpoint
CREATE INDEX "idx_exchanges_answer" ON "exchanges" USING btree ("channel_id","answer_ts");