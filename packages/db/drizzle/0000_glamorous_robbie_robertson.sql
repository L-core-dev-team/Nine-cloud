CREATE TABLE "game_saves" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"schema_version" integer NOT NULL,
	"canon_version" text NOT NULL,
	"rule_version" text NOT NULL,
	"memory_policy_version" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turn_events" (
	"id" text PRIMARY KEY NOT NULL,
	"save_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"sequence" integer NOT NULL,
	"event_type" text NOT NULL,
	"before_revision" integer NOT NULL,
	"after_revision" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turn_requests" (
	"save_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"expected_revision" integer NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turn_requests_save_id_idempotency_key_pk" PRIMARY KEY("save_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "turn_events" ADD CONSTRAINT "turn_events_save_id_game_saves_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."game_saves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_requests" ADD CONSTRAINT "turn_requests_save_id_game_saves_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."game_saves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_saves_owner_id_idx" ON "game_saves" USING btree ("owner_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "turn_events_save_sequence_idx" ON "turn_events" USING btree ("save_id","sequence");