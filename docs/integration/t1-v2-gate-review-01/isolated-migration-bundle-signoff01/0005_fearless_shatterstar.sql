CREATE TABLE "account_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"session_hash" text NOT NULL,
	"operation" text NOT NULL,
	"old_email" text NOT NULL,
	"new_email" text,
	"phase" text NOT NULL,
	"digest" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_operations" ADD CONSTRAINT "account_operations_owner_id_auth_accounts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_accounts"("id") ON DELETE cascade ON UPDATE no action;