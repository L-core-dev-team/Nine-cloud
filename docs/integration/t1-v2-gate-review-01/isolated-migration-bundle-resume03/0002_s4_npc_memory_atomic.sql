ALTER TABLE "turn_events" ADD COLUMN "source" text;
--> statement-breakpoint
ALTER TABLE "turn_events" ADD COLUMN "rule_version" text;
--> statement-breakpoint
CREATE TABLE "npc_memory_journals" (
  "save_id" text PRIMARY KEY NOT NULL,
  "schema_version" integer DEFAULT 1 NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  "payload" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "npc_memory_journals" ADD CONSTRAINT "npc_memory_journals_save_id_game_saves_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."game_saves"("id") ON DELETE cascade ON UPDATE no action;
