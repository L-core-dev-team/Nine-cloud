-- Fail before making any schema change. Existing accounts may differ only by
-- email case because the previous unique constraint was case-sensitive.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth_accounts GROUP BY lower(email) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'AUTH_EMAIL_CASE_COLLISION: resolve duplicate case-insensitive account emails before applying migration 0016';
  END IF;
END $$;

CREATE UNIQUE INDEX "auth_accounts_email_lower_idx" ON "auth_accounts" (lower("email"));

CREATE TABLE "auth_external_identities" (
  "provider_subject" text NOT NULL,
  "identity_kind" text NOT NULL,
  "identifier_digest" text NOT NULL,
  "owner_id" text NOT NULL,
  "verified_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "auth_external_identities_pk" PRIMARY KEY ("provider_subject", "identity_kind"),
  CONSTRAINT "auth_external_identities_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_accounts"("id") ON DELETE CASCADE,
  CONSTRAINT "auth_external_identity_kind_check" CHECK ("identity_kind" IN ('email', 'phone')),
  CONSTRAINT "auth_external_identity_digest_check" CHECK ("identifier_digest" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "auth_external_identity_digest_idx" ON "auth_external_identities" USING btree ("identity_kind", "identifier_digest") WHERE "revoked_at" IS NULL;
CREATE UNIQUE INDEX "auth_external_identity_owner_kind_idx" ON "auth_external_identities" USING btree ("owner_id", "identity_kind") WHERE "revoked_at" IS NULL;
ALTER TABLE "auth_external_identities" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "auth_external_identities" FROM PUBLIC;
DO $$
DECLARE
  role_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON "auth_external_identities" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON "auth_external_identities" FROM authenticated';
  END IF;
END $$;

CREATE TABLE "auth_provider_ip_limits" (
  "ip_digest" text PRIMARY KEY,
  "window_started_at" timestamp with time zone NOT NULL,
  "hour_count" integer NOT NULL DEFAULT 0 CHECK ("hour_count" >= 0),
  "day_started_at" date NOT NULL,
  "day_count" integer NOT NULL DEFAULT 0 CHECK ("day_count" >= 0)
);
CREATE INDEX "auth_provider_ip_limits_day_started_at_idx" ON "auth_provider_ip_limits" ("day_started_at");
ALTER TABLE "auth_provider_ip_limits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "auth_provider_ip_limits" FROM PUBLIC;
DO $$
DECLARE
  role_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON "auth_provider_ip_limits" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON "auth_provider_ip_limits" FROM authenticated';
  END IF;
END $$;

CREATE TABLE "auth_provider_account_limits" (
  "owner_digest" text PRIMARY KEY CHECK ("owner_digest" ~ '^[a-f0-9]{64}$'),
  "window_started_at" timestamp with time zone NOT NULL,
  "hour_count" integer NOT NULL DEFAULT 0 CHECK ("hour_count" >= 0),
  "day_started_at" date NOT NULL,
  "day_count" integer NOT NULL DEFAULT 0 CHECK ("day_count" >= 0)
);
CREATE INDEX "auth_provider_account_limits_day_started_at_idx" ON "auth_provider_account_limits" ("day_started_at");
ALTER TABLE "auth_provider_account_limits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "auth_provider_account_limits" FROM PUBLIC;
DO $$
DECLARE
  role_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON "auth_provider_account_limits" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON "auth_provider_account_limits" FROM authenticated';
  END IF;
END $$;
