-- Card schema admission and upgrade. Drizzle runs this statement transactionally.
-- Existing databases require an explicitly retired legacy writer. The operator must
-- stop writers, archive a verified backup, transfer ownership to the installer,
-- revoke old grants and set jiuxiao.card_retired_writer for the installation session.
-- No authorization, data deletion, schema downgrade or fabricated model attribution.
DO $migration$
DECLARE
  ddl constant text := $card_ddl$
CREATE TABLE card_import.imports (
 owner_id text NOT NULL, id uuid NOT NULL, sha256 text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('card','worldbook','attachment')),
 filename text NOT NULL, original bytea NOT NULL, parsed jsonb,
 error text, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,id), UNIQUE(owner_id,kind,sha256)
);
CREATE TABLE card_import.cards (
 owner_id text NOT NULL, id uuid NOT NULL, import_id uuid NOT NULL, parent_id uuid,
 metadata jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,id),
 FOREIGN KEY(owner_id,import_id) REFERENCES card_import.imports(owner_id,id),
 FOREIGN KEY(owner_id,parent_id) REFERENCES card_import.cards(owner_id,id)
);
CREATE TABLE card_import.sessions (
 owner_id text NOT NULL, id uuid NOT NULL, card_id uuid NOT NULL,
 revision integer NOT NULL DEFAULT 0, recursive_worldbook boolean NOT NULL DEFAULT true, greeting_index integer NOT NULL DEFAULT -1 CHECK (greeting_index >= -1), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,card_id) REFERENCES card_import.cards(owner_id,id)
);
CREATE TABLE card_import.links (
 owner_id text NOT NULL, card_id uuid NOT NULL, import_id uuid NOT NULL, uri text NOT NULL,
 PRIMARY KEY(owner_id,card_id,uri),
 FOREIGN KEY(owner_id,card_id) REFERENCES card_import.cards(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,import_id) REFERENCES card_import.imports(owner_id,id)
);
CREATE TABLE card_import.personas (
 owner_id text NOT NULL, id uuid NOT NULL, is_default boolean NOT NULL DEFAULT false,
 PRIMARY KEY(owner_id,id)
);
CREATE UNIQUE INDEX card_import_one_default_persona ON card_import.personas(owner_id) WHERE is_default;
CREATE TABLE card_import.persona_versions (
 owner_id text NOT NULL, id uuid NOT NULL, persona_id uuid NOT NULL, name text NOT NULL, description text NOT NULL, extensions jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,id),
 FOREIGN KEY(owner_id,persona_id) REFERENCES card_import.personas(owner_id,id)
);
CREATE TABLE card_import.session_personas (
 owner_id text NOT NULL, session_id uuid NOT NULL, version_id uuid NOT NULL,
 PRIMARY KEY(owner_id,session_id), FOREIGN KEY(owner_id,session_id) REFERENCES card_import.sessions(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,version_id) REFERENCES card_import.persona_versions(owner_id,id)
);
CREATE TABLE card_import.global_worldbooks (
 owner_id text NOT NULL, import_id uuid NOT NULL,
 PRIMARY KEY(owner_id,import_id),
 FOREIGN KEY(owner_id,import_id) REFERENCES card_import.imports(owner_id,id)
);
CREATE TABLE card_import.session_worldbooks (
 owner_id text NOT NULL, session_id uuid NOT NULL, import_id uuid NOT NULL,
 PRIMARY KEY(owner_id,session_id,import_id),
 FOREIGN KEY(owner_id,session_id) REFERENCES card_import.sessions(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,import_id) REFERENCES card_import.imports(owner_id,id)
);
CREATE TABLE card_import.duplicate_requests (
 owner_id text NOT NULL, key uuid NOT NULL, fingerprint text NOT NULL, card_id uuid NOT NULL,
 PRIMARY KEY(owner_id,key), FOREIGN KEY(owner_id,card_id) REFERENCES card_import.cards(owner_id,id)
);
CREATE TABLE card_import.requests (
 owner_id text NOT NULL, session_id uuid NOT NULL, key uuid NOT NULL,
 fingerprint text NOT NULL, expected_revision integer NOT NULL, action text NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','completed','failed')),
 narrative text, error text, resulting_revision integer, model_snapshot jsonb,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,session_id,key),
 FOREIGN KEY(owner_id,session_id) REFERENCES card_import.sessions(owner_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX card_import_one_pending ON card_import.requests(owner_id,session_id) WHERE status='pending';

CREATE TABLE card_import.group_participants (
 owner_id text NOT NULL, session_id uuid NOT NULL, id uuid NOT NULL, card_id uuid NOT NULL,
 ordinal integer NOT NULL, display_name text NOT NULL,
 PRIMARY KEY(owner_id,session_id,id), UNIQUE(owner_id,session_id,ordinal), UNIQUE(owner_id,session_id,card_id),
 FOREIGN KEY(owner_id,session_id) REFERENCES card_import.sessions(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,card_id) REFERENCES card_import.cards(owner_id,id)
);
CREATE TABLE card_import.group_participant_worldbooks (
 owner_id text NOT NULL, session_id uuid NOT NULL, participant_id uuid NOT NULL, import_id uuid NOT NULL,
 PRIMARY KEY(owner_id,session_id,participant_id,import_id),
 FOREIGN KEY(owner_id,session_id,participant_id) REFERENCES card_import.group_participants(owner_id,session_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,import_id) REFERENCES card_import.imports(owner_id,id)
);
CREATE TABLE card_import.group_turns (
 owner_id text NOT NULL, session_id uuid NOT NULL, key uuid NOT NULL, mode text NOT NULL CHECK(mode IN ('manual','auto','multi')), selected jsonb NOT NULL,
 PRIMARY KEY(owner_id,session_id,key), FOREIGN KEY(owner_id,session_id,key) REFERENCES card_import.requests(owner_id,session_id,key) ON DELETE CASCADE
);
CREATE TABLE card_import.group_messages (
 owner_id text NOT NULL, session_id uuid NOT NULL, key uuid NOT NULL, ordinal integer NOT NULL, participant_id uuid NOT NULL, body text NOT NULL,
 PRIMARY KEY(owner_id,session_id,key,ordinal),
 FOREIGN KEY(owner_id,session_id,key) REFERENCES card_import.group_turns(owner_id,session_id,key) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,session_id,participant_id) REFERENCES card_import.group_participants(owner_id,session_id,id)
);

CREATE TABLE card_import.group_settings (
 owner_id text NOT NULL, session_id uuid NOT NULL, strategy text NOT NULL DEFAULT 'manual' CHECK(strategy IN ('manual','auto')),
 PRIMARY KEY(owner_id,session_id), FOREIGN KEY(owner_id,session_id) REFERENCES card_import.sessions(owner_id,id) ON DELETE CASCADE
);

CREATE TABLE card_import.model_allowances (
 approval_id text PRIMARY KEY, binding text NOT NULL, used integer NOT NULL CHECK(used>=0)
);
CREATE TABLE card_import.model_calls (
 approval_id text NOT NULL REFERENCES card_import.model_allowances(approval_id),
 owner_id text NOT NULL, session_id uuid NOT NULL, key uuid NOT NULL,
 PRIMARY KEY(approval_id,owner_id,session_id,key)
);
$card_ddl$;
  target_schema constant name := 'card_import';
  expected constant name := 'jx_0025_expected';
  previous_path text := current_setting('search_path');
  previous_timeout text := current_setting('lock_timeout');
  obj record;
  statement text;
  hist boolean; pre110 boolean;
  writer oid;
  ns oid;
  table_name text;
  expected_shape jsonb;
  actual_shape jsonb;
  form text;
  old_unique name;
BEGIN
  PERFORM set_config('search_path','pg_catalog, pg_temp',true);
  PERFORM set_config('lock_timeout','5s',true);
  IF current_setting('server_version_num')::int < 150000 OR
     to_regclass('public.story_narratives') IS NULL THEN
    RAISE EXCEPTION 'CARDS_0025_REQUIRES_POSTGRES_15_AND_BASE_0024';
  END IF;
  -- A collision aborts before changing any existing namespace or table.
  EXECUTE format('CREATE SCHEMA %I',expected);
  FOREACH statement IN ARRAY string_to_array(ddl,';') LOOP
    IF btrim(statement) <> '' THEN EXECUTE replace(statement,'card_import.',expected||'.'); END IF;
  END LOOP;
  IF to_regnamespace(target_schema) IS NULL THEN
    EXECUTE format('ALTER SCHEMA %I RENAME TO %I',expected,target_schema);
  ELSE
    IF (SELECT nspowner FROM pg_namespace WHERE nspname=target_schema) <> current_user::regrole::oid THEN
      RAISE EXCEPTION 'CARD_SCHEMA_MUST_BE_OWNED_BY_INSTALLER';
    END IF;
    writer := to_regrole(nullif(current_setting('jiuxiao.card_retired_writer',true),''));
    IF writer IS NULL OR writer=current_user::regrole::oid OR
      EXISTS(SELECT 1 FROM pg_roles WHERE oid=writer AND (rolcanlogin OR rolsuper OR rolcreaterole OR rolbypassrls)) OR
      EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=writer OR member=writer) OR
      EXISTS(SELECT 1 FROM pg_stat_activity WHERE usesysid=writer) THEN
      RAISE EXCEPTION 'CARD_LEGACY_WRITER_NOT_RETIRED';
    END IF;
    -- Reject other granted writers (including PUBLIC), unexpected owners or
    -- executable objects before touching rows. Local demo superusers are not
    -- eligible old application logins. Inspect a copy; do not retire a shared login.
    IF EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
      WHERE n.nspname=target_schema AND a.grantee<>n.nspowner AND a.privilege_type='CREATE')
      OR EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace=to_regnamespace(target_schema)
        AND (c.relkind NOT IN ('r','i') OR c.relowner<>current_user::regrole::oid OR c.relrowsecurity OR c.relforcerowsecurity OR c.relpersistence<>'p'))
      OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
        WHERE c.relnamespace=to_regnamespace(target_schema) AND a.grantee<>c.relowner)
      OR EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
        WHERE c.relnamespace=to_regnamespace(target_schema) AND a.attacl IS NOT NULL)
      OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace=to_regnamespace(target_schema))
      OR EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace=to_regnamespace(target_schema) AND (NOT t.tgisinternal OR t.tgenabled<>'O'))
      OR EXISTS(SELECT 1 FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class WHERE c.relnamespace=to_regnamespace(target_schema))
      OR EXISTS(SELECT 1 FROM pg_inherits i JOIN pg_class c ON c.oid IN (i.inhrelid,i.inhparent) WHERE c.relnamespace=to_regnamespace(target_schema)) THEN
      RAISE EXCEPTION 'CARD_SCHEMA_UNRECOGNIZED_ACL_OR_OBJECT';
    END IF;
    FOR obj IN SELECT relname FROM pg_class WHERE relnamespace=to_regnamespace(target_schema) AND relkind='r' ORDER BY relname LOOP
      EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE',target_schema,obj.relname);
    END LOOP;
    hist := to_regclass('card_import.personas') IS NULL;
    pre110 := to_regclass('card_import.model_calls') IS NULL;
    IF hist OR pre110 THEN
      DROP TABLE jx_0025_expected.model_calls, jx_0025_expected.model_allowances;
      ALTER TABLE jx_0025_expected.requests DROP COLUMN model_snapshot;
    END IF;
    IF hist THEN
      DROP TABLE jx_0025_expected.group_messages, jx_0025_expected.group_turns, jx_0025_expected.group_participant_worldbooks,
        jx_0025_expected.group_participants, jx_0025_expected.group_settings, jx_0025_expected.session_worldbooks,
        jx_0025_expected.global_worldbooks, jx_0025_expected.duplicate_requests, jx_0025_expected.session_personas,
        jx_0025_expected.persona_versions, jx_0025_expected.personas;
      ALTER TABLE jx_0025_expected.sessions DROP COLUMN recursive_worldbook;
      ALTER TABLE jx_0025_expected.cards ADD UNIQUE(owner_id,import_id);
    END IF;
    -- Compare definitions, not generated object names. Search path ensures FK
    -- deparsing is schema-qualified. Column order is immaterial to named SQL.
    FOREACH form IN ARRAY ARRAY[expected::text,target_schema::text] LOOP
      ns := to_regnamespace(form);
      WITH tables AS (
        SELECT * FROM pg_class WHERE relnamespace=ns AND relkind='r'
      ), items AS (
        SELECT jsonb_build_array('table',t.relname,t.relam) item FROM tables t
        UNION ALL
        SELECT jsonb_build_array('column',t.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
          a.attidentity,a.attgenerated,a.attcollation,pg_get_expr(d.adbin,d.adrelid)) FROM tables t
          JOIN pg_attribute a ON t.oid=a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum
          WHERE a.attnum>0 AND NOT a.attisdropped
        UNION ALL
        SELECT jsonb_build_array('constraint',t.relname,replace(pg_get_constraintdef(k.oid),form||'.','card_import.'),
          k.convalidated,k.condeferrable,k.condeferred) FROM tables t JOIN pg_constraint k ON t.oid=k.conrelid
        UNION ALL
        SELECT jsonb_build_array('index',t.relname,substring(pg_get_indexdef(i.indexrelid) FROM ' USING .*$'),
          i.indisprimary,i.indisunique,i.indisvalid,i.indisready,i.indimmediate,i.indnullsnotdistinct)
          FROM tables t JOIN pg_index i ON t.oid=i.indrelid
      )
      SELECT jsonb_agg(item ORDER BY item) INTO actual_shape FROM items;
      IF form=expected THEN expected_shape:=actual_shape;
      ELSIF actual_shape IS DISTINCT FROM expected_shape THEN RAISE EXCEPTION 'CARD_SCHEMA_UNSUPPORTED_CATALOG'; END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM card_import.requests WHERE status='pending') THEN RAISE EXCEPTION 'CARD_PENDING_REQUESTS_MUST_DRAIN'; END IF;
    IF hist THEN
      SELECT conname INTO STRICT old_unique FROM pg_constraint WHERE conrelid='card_import.cards'::regclass AND contype='u';
      EXECUTE format('ALTER TABLE card_import.cards DROP CONSTRAINT %I',old_unique);
      ALTER TABLE card_import.sessions ADD COLUMN recursive_worldbook boolean NOT NULL DEFAULT true;
    END IF;
    IF hist OR pre110 THEN
      ALTER TABLE card_import.requests ADD COLUMN model_snapshot jsonb;
      FOREACH statement IN ARRAY string_to_array(ddl,';') LOOP
        table_name := substring(statement FROM 'CREATE TABLE card_import\.([a-z_]+)');
        IF table_name IS NOT NULL AND to_regclass(format('card_import.%I',table_name)) IS NULL THEN EXECUTE statement; END IF;
        IF hist AND statement LIKE '%CREATE UNIQUE INDEX card_import_one_default_persona %' THEN EXECUTE statement; END IF;
      END LOOP;
    END IF;
    -- Scratch namespace was created exclusively above; drop known tables only,
    -- without cascading into unexpected dependencies.
    SELECT string_agg(format('%I.%I',expected,relname),', ' ORDER BY relname) INTO statement
      FROM pg_class WHERE relnamespace=to_regnamespace(expected) AND relkind='r';
    EXECUTE 'DROP TABLE '||statement;
    EXECUTE format('DROP SCHEMA %I',expected);
  END IF;
  -- Explicit defaults from a target installation must not publish new card
  -- data. Runtime and erasure rights are installed separately after migration.
  IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
      WHERE c.relnamespace=to_regnamespace(target_schema) AND a.grantee<>c.relowner) THEN
    RAISE EXCEPTION 'CARD_UNEXPECTED_DEFAULT_TABLE_GRANT';
  END IF;
  PERFORM set_config('search_path',previous_path,true);
  PERFORM set_config('lock_timeout',previous_timeout,true);
END $migration$;
