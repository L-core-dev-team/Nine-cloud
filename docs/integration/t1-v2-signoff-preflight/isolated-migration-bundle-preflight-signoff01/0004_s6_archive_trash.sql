CREATE TABLE "cloud_archive_trash" (
	"save_id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"deleted_revision" integer NOT NULL,
	"backup" jsonb NOT NULL,
	"digest" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cloud_archive_trash" ADD CONSTRAINT "cloud_archive_trash_save_id_game_saves_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."game_saves"("id") ON DELETE no action ON UPDATE no action;