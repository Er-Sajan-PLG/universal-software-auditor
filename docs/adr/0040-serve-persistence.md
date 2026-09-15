# 40. Serve persists reports to disk only when asked

- **Date:** 2026-09-15
- **Status:** Accepted

## Context

Slice 1 kept reports in process memory: restart the server, lose every
audit. For real testing that is the sharpest limitation — no history, no
overview, re-run everything after every restart.

## Decision

`--data-dir <dir>` persists finished job records (metadata plus the
rendered report) as one JSON file per job, pruned to the same bound as
memory history. Without the flag, behavior is unchanged: memory only.
Startup reloads the directory, so history survives restarts. A
`GET /api/audits` list endpoint backs a history section in the UI.

## Consequences

- Reports at rest are a new asset class: they contain audited-tree
  content, same sensitivity as transcript files. They live in an
  operator-owned directory with default permissions, served only behind
  the bearer token like everything else. No new threat, but a named one.
- Stored format only: a job filed as JSON cannot later be re-rendered as
  HTML from disk (the report object is not retained). Re-rendering from
  stored objects is explicitly deferred — it would keep full findings in
  two shapes instead of one.
- The pruning rule is shared: disk and memory histories obey the same
  bound, so neither grows without the other.
