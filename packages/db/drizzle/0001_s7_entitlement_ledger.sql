CREATE TABLE "entitlement_balances" (
	"owner_id" text NOT NULL,
	"entitlement_key" text NOT NULL,
	"available_units" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_balances_owner_id_entitlement_key_pk" PRIMARY KEY("owner_id","entitlement_key"),
	CONSTRAINT "entitlement_balances_nonnegative_check" CHECK ("entitlement_balances"."available_units" >= 0),
	CONSTRAINT "entitlement_balances_safe_integer_check" CHECK ("entitlement_balances"."available_units" <= 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "entitlement_ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"entitlement_key" text NOT NULL,
	"entry_type" text NOT NULL,
	"delta_units" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"reverses_entry_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_ledger_entry_type_check" CHECK ("entitlement_ledger_entries"."entry_type" IN ('grant', 'consume', 'refund')),
	CONSTRAINT "entitlement_ledger_delta_sign_check" CHECK ((
    ("entitlement_ledger_entries"."entry_type" = 'grant' AND "entitlement_ledger_entries"."delta_units" > 0 AND "entitlement_ledger_entries"."reverses_entry_id" IS NULL) OR
    ("entitlement_ledger_entries"."entry_type" = 'consume' AND "entitlement_ledger_entries"."delta_units" < 0 AND "entitlement_ledger_entries"."reverses_entry_id" IS NULL) OR
    ("entitlement_ledger_entries"."entry_type" = 'refund' AND "entitlement_ledger_entries"."delta_units" > 0 AND "entitlement_ledger_entries"."reverses_entry_id" IS NOT NULL)
  )),
	CONSTRAINT "entitlement_ledger_balance_check" CHECK ("entitlement_ledger_entries"."balance_after" >= 0 AND "entitlement_ledger_entries"."balance_after" <= 9007199254740991)
);
--> statement-breakpoint
ALTER TABLE "entitlement_ledger_entries" ADD CONSTRAINT "entitlement_ledger_balance_fk" FOREIGN KEY ("owner_id","entitlement_key") REFERENCES "public"."entitlement_balances"("owner_id","entitlement_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_ledger_entries" ADD CONSTRAINT "entitlement_ledger_reversal_fk" FOREIGN KEY ("reverses_entry_id") REFERENCES "public"."entitlement_ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entitlement_ledger_owner_idempotency_idx" ON "entitlement_ledger_entries" USING btree ("owner_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "entitlement_ledger_single_reversal_idx" ON "entitlement_ledger_entries" USING btree ("reverses_entry_id") WHERE "entitlement_ledger_entries"."reverses_entry_id" IS NOT NULL;
--> statement-breakpoint
CREATE FUNCTION "reject_entitlement_ledger_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'entitlement ledger is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "entitlement_ledger_append_only" BEFORE UPDATE OR DELETE ON "entitlement_ledger_entries"
FOR EACH ROW EXECUTE FUNCTION "reject_entitlement_ledger_mutation"();
