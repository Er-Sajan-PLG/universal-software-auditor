# 38. A root AGENTS.md carries the repo's operating manual

- **Date:** 2026-09-14
- **Status:** Accepted

## Context

Every agent session in this repo re-learned the same things: the gate
sequence, the commit rules, the bot-push limbo, the `.npmrc` scope trap,
the docs-sync ordering. Each re-learning cost a session and occasionally
a red release (the v2.8.1 registry override). The repo already ships an
agent guide _for other projects_ (`templates/AGENTS.audit.md`) but had no
file telling an agent how to work _here_ — FND-006 stayed open saying so.

## Decision

A root `AGENTS.md` holds the complete operating manual: the loop, the
commands, commit and branch rules, CI behavior including bot-push
handling, docs hygiene, config policy, code and CLI conventions, the
release machinery with its scars, secrets handling, the self-audit loop,
an architecture map, and review culture. Long on purpose; completeness
beats token cost for a file that decides whether agent sessions succeed.

## Consequences

- New sessions and contributors start from the manual, not from zero.
- The manual itself is gated like any doc (Prettier, claim scanner), so
  it cannot rot silently — a stale instruction fails `docs:all` or a
  review, same as stale code fails tests.
- When the manual is wrong, fix the manual in the same PR as the change
  that proved it wrong. Folklore outside this file is a bug.
