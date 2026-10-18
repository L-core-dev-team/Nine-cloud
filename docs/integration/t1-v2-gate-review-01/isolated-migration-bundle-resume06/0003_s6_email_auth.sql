CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_challenges" (
	"email" text PRIMARY KEY NOT NULL,
	"digest" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"window_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_mail_limits" (
	"bucket" bigint PRIMARY KEY NOT NULL,
	"sent" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_owner_id_auth_accounts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_email_idx" ON "auth_accounts" USING btree ("email");