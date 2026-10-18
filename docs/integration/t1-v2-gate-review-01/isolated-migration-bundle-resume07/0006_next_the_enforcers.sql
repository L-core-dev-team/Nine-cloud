ALTER TABLE "turn_requests" ADD COLUMN "narrative_attempt_id" text;--> statement-breakpoint
ALTER TABLE "turn_requests" ADD COLUMN "narrative_status" text DEFAULT 'not_requested' NOT NULL;--> statement-breakpoint
ALTER TABLE "turn_requests" ADD COLUMN "narrative_updated_at" timestamp with time zone;