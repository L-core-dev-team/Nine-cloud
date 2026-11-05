-- Local explicit installation only. Not registered in Drizzle; production review required.
CREATE SCHEMA card_import;
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
 revision integer NOT NULL DEFAULT 0, greeting_index integer NOT NULL DEFAULT -1 CHECK (greeting_index >= -1), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,id), FOREIGN KEY(owner_id,card_id) REFERENCES card_import.cards(owner_id,id)
);
CREATE TABLE card_import.links (
 owner_id text NOT NULL, card_id uuid NOT NULL, import_id uuid NOT NULL, uri text NOT NULL,
 PRIMARY KEY(owner_id,card_id,uri),
 FOREIGN KEY(owner_id,card_id) REFERENCES card_import.cards(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,import_id) REFERENCES card_import.imports(owner_id,id)
);
-- Local test schema only; upgrade and rollback require separate review.
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
 narrative text, error text, resulting_revision integer,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,session_id,key),
 FOREIGN KEY(owner_id,session_id) REFERENCES card_import.sessions(owner_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX card_import_one_pending ON card_import.requests(owner_id,session_id) WHERE status='pending';
