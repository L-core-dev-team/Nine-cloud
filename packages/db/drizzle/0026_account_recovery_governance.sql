-- 0025 provides the durable pre-send counter. Historical outcomes remain unknown.
ALTER TABLE card_import.model_calls ADD COLUMN outcome text NOT NULL DEFAULT 'unknown'
  CHECK (outcome IN ('unknown','acknowledged'));
--> statement-breakpoint
CREATE FUNCTION card_import.check_consumption() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.used <> 0 THEN RAISE EXCEPTION 'INVALID_INITIAL_CONSUMPTION'; END IF;
  ELSIF NEW.approval_id <> OLD.approval_id OR NEW.binding <> OLD.binding OR NEW.used <> OLD.used + 1 THEN
    RAISE EXCEPTION 'ALLOWANCE_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION card_import.check_consumption() FROM PUBLIC;
CREATE TRIGGER monotonic_allowance BEFORE INSERT OR UPDATE ON card_import.model_allowances
FOR EACH ROW EXECUTE FUNCTION card_import.check_consumption();
--> statement-breakpoint
CREATE TABLE public.account_erasure_delivery (
  operation_id text NOT NULL,
  subject_digest text PRIMARY KEY,
  pending_subject uuid,
  state text NOT NULL CHECK (state IN ('pending','unknown','retry','completed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  completed_at timestamptz,
  policy_version text NOT NULL,
  CHECK ((state='completed') = (pending_subject IS NULL)),
  CHECK ((state='completed') = (completed_at IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE public.account_erasure_delivery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_erasure_delivery FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON public.account_erasure_delivery FROM %I',r);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
-- A verified but stale OTP must not recreate a removed provider identity.
CREATE FUNCTION public.block_erased_provider_subject() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE d text := encode(sha256(convert_to(NEW.provider_subject,'UTF8')),'hex');
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(d, 0));
  IF EXISTS (SELECT 1 FROM public.account_erasure_delivery WHERE subject_digest=d) THEN
    RAISE EXCEPTION 'IDENTITY_ERASURE_IN_PROGRESS' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.block_erased_provider_subject() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER prevent_deleted_subject BEFORE INSERT OR UPDATE OF provider_subject,owner_id
ON public.auth_external_identities FOR EACH ROW EXECUTE FUNCTION public.block_erased_provider_subject();

--> statement-breakpoint
-- Maintenance only. An operator supplies the cutoff approved for this exact policy,
-- after independent backup/identity reconciliation. No scheduled retention interval.
CREATE FUNCTION public.finish_erasure_retention(approved_policy text, reconciled_before timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE removed integer;
BEGIN
  IF coalesce(length(trim(approved_policy)),0)=0 OR reconciled_before IS NULL OR reconciled_before>clock_timestamp() THEN
    RAISE EXCEPTION 'ERASURE_RECONCILIATION_REQUIRED';
  END IF;
  DELETE FROM public.account_erasure_delivery WHERE state='completed' AND policy_version=approved_policy
    AND completed_at<=reconciled_before;
  GET DIAGNOSTICS removed=ROW_COUNT;
  RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.finish_erasure_retention(text,timestamptz) FROM PUBLIC;

--> statement-breakpoint
-- A host with cards disabled must not report account erasure if card data is still live.
-- All other owner-scoped card records reference one of these roots.
CREATE FUNCTION card_import.require_erased_account_roots() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM card_import.imports WHERE owner_id=OLD.id)
     OR EXISTS(SELECT 1 FROM card_import.personas WHERE owner_id=OLD.id)
     OR EXISTS(SELECT 1 FROM card_import.model_calls WHERE owner_id=OLD.id) THEN
    RAISE EXCEPTION 'CARD_ERASURE_REQUIRED';
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION card_import.require_erased_account_roots() FROM PUBLIC;
CREATE TRIGGER require_erased_card_roots BEFORE DELETE ON public.auth_accounts
FOR EACH ROW EXECUTE FUNCTION card_import.require_erased_account_roots();
