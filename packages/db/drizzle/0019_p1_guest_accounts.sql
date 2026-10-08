-- P1: represent guests honestly without email credentials or OTP challenge rows.
-- Existing email accounts remain email accounts; the new columns are backfilled
-- by defaults and do not rewrite their identifiers or owned saves.
ALTER TABLE auth_accounts ALTER COLUMN email DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE auth_accounts ADD COLUMN is_guest boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE auth_accounts ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE auth_accounts ADD CONSTRAINT auth_accounts_identity_check
  CHECK ((is_guest = (email IS NULL)) IS TRUE);
--> statement-breakpoint
CREATE INDEX auth_accounts_guest_retention_idx ON auth_accounts(last_seen_at, id)
  WHERE is_guest AND closed_at IS NULL;
