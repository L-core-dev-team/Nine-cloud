CREATE TABLE account_rate_limits(key text PRIMARY KEY, expires_at timestamptz NOT NULL, hits integer NOT NULL CHECK(hits>0));
--> statement-breakpoint
ALTER TABLE account_operations ALTER COLUMN old_email DROP NOT NULL;
--> statement-breakpoint
CREATE TABLE account_lifecycle_audit(id text PRIMARY KEY, owner_digest text NOT NULL, operation text NOT NULL, policy_version text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
UPDATE account_operations SET old_email=NULL,new_email=NULL,digest=NULL WHERE phase IN ('completed','cancelled','failed') OR expires_at<=now();
