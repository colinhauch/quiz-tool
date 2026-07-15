# Reference SQL Schema

> **[UNREVIEWED]** — Never executed. This is a sketch from the original design document, not a migration — it has not been run against SQLite, and no implementation exists to compare it to.

**This is a proposal, not a description.** It is preserved because the *shape* of the first attempt is informative — if the eventual schema differs, the difference is a decision worth understanding, and that is easier to see with the original in front of you. Once real migrations exist, they are the source of truth and this file should either be deleted or explicitly reframed as history.

The reasoning behind these choices — why SQLite, why JSON columns, what would make us leave — is in [README.md](README.md).

```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY, types JSON NOT NULL, labels JSON NOT NULL,
  aliases JSON, descriptions JSON, media JSON,
  pack_id TEXT NOT NULL, source TEXT, created TEXT NOT NULL, modified TEXT NOT NULL
);

CREATE TABLE relation_types (
  id TEXT PRIMARY KEY, def JSON NOT NULL, pack_id TEXT NOT NULL
);

CREATE TABLE statements (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL REFERENCES entities(id),
  relation TEXT NOT NULL REFERENCES relation_types(id),
  object_entity TEXT REFERENCES entities(id),      -- exactly one of object_entity /
  object_literal JSON,                              -- object_literal is non-null
  qualifiers JSON NOT NULL DEFAULT '{}',
  rank TEXT NOT NULL DEFAULT 'normal' CHECK (rank IN ('preferred','normal','deprecated')),
  pack_id TEXT NOT NULL, source TEXT, created TEXT NOT NULL, modified TEXT NOT NULL,
  CHECK ((object_entity IS NULL) <> (object_literal IS NULL))
);
CREATE INDEX idx_stmt_subject  ON statements(subject, relation);
CREATE INDEX idx_stmt_object   ON statements(object_entity, relation);

CREATE TABLE answer_events (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
  statement_id TEXT NOT NULL, direction TEXT NOT NULL,
  template_id TEXT, input_mode TEXT, correct INTEGER NOT NULL,
  answer_given JSON, distractors JSON, latency_ms INTEGER,
  asked_at TEXT NOT NULL, session_id TEXT
);
CREATE INDEX idx_ans_user_time ON answer_events(user_id, asked_at);

CREATE TABLE cards (
  user_id TEXT NOT NULL, statement_id TEXT NOT NULL, direction TEXT NOT NULL,
  due TEXT, state TEXT NOT NULL DEFAULT 'new',
  algo TEXT, algo_state JSON, reps INTEGER DEFAULT 0, lapses INTEGER DEFAULT 0,
  last_review TEXT,
  PRIMARY KEY (user_id, statement_id, direction)
);

CREATE TABLE packs (
  id TEXT NOT NULL, version TEXT NOT NULL, manifest JSON NOT NULL,
  installed_at TEXT NOT NULL, PRIMARY KEY (id, version)
);
```

## Notes on the sketch

**The `CHECK` on `statements`** enforces the closed object union at the storage layer — exactly one of `object_entity` / `object_literal` is non-null. This is the union from [../knowledge-graph/statements.md](../knowledge-graph/statements.md) expressed in SQL, and it is the reason a third arm would be a schema change and not just a type change.

**Two indexes on `statements`**, forward and reverse, because reverse questions query by object. Sets-are-queries means both directions are hot paths.

**`answer_events` has no foreign key to `statements`** — deliberately, if this sketch is right. History must survive a statement being deprecated or a pack being uninstalled, so the log points at IDs it does not constrain. The original design mentioned a `statements_archive` for uninstall integrity; that table is not in this sketch, which is a gap.

**Region rollups** were intended to use a recursive CTE over `located_in` statements (city → prefecture → country → continent). Nothing here is precomputed. That query is the one most likely to force the graph-store question.
