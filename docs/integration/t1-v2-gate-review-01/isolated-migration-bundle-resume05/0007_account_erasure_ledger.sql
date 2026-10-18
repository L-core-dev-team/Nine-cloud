-- Ordinary ledger mutation remains prohibited. The only exception is deletion
-- for a verified, unexpired account-erasure operation in this transaction.
CREATE OR REPLACE FUNCTION reject_entitlement_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND EXISTS (
    SELECT 1 FROM account_operations o
    WHERE o.id = current_setting('jiuxiao.account_erasure_operation', true)
      AND o.owner_id = OLD.owner_id AND o.operation = 'delete'
      AND o.phase = 'ready' AND o.expires_at > now()
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'entitlement ledger is append-only';
END;
$$;
