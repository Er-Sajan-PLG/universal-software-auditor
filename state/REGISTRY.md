# REGISTRY.md — Agent Registry

**Last updated:** 2026-10-01T17:45:00+05:45

---

## Active Agents

### HERMES — Bootstrap Agent

| Field         | Value                                |
| ------------- | ------------------------------------ |
| Agent ID      | HX01                                 |
| Model         | meituan/longcat-2.5-preview:free     |
| Branch        | docs/0042-continuous-ingestion       |
| Task          | Bootstrap MACP + merge 5 branches    |
| Started       | 2026-10-01T16:30:00+05:45            |
| Status        | COMPLETED                            |
| Files claimed | state/ (entire directory) — released |

---

## File Ownership Rules

1. If another **ACTIVE** agent owns files you need → STOP, coordinate via session file
2. If owner is **INACTIVE** (>24h) → you may claim ownership
3. **Shared files** (config, package.json, etc.) → [COORDINATION] note in both session files

---

## Inactive Agents

None yet — this is the first session.

---

## Session Files

| Session                                         | Agent | Branch                         | Status    |
| ----------------------------------------------- | ----- | ------------------------------ | --------- |
| `sessions/20261001-1630-HX01-bootstrap-macp.md` | HX01  | docs/0042-continuous-ingestion | COMPLETED |
