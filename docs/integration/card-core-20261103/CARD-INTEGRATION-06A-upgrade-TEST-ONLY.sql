-- TEST ONLY: candidate based on 054daa0 schema; not a production migration.

ALTER TABLE card_import.cards DROP CONSTRAINT cards_owner_id_import_id_key;

ALTER TABLE card_import.sessions ADD COLUMN recursive_worldbook boolean NOT NULL DEFAULT true;

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
