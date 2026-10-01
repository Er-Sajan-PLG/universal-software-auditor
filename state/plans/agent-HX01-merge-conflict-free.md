# Plan: agent-HX01-merge-conflict-free

**Agent:** HX01
**Created:** 2026-10-01T17:15:00+05:45
**Status:** In Progress

---

## Objective

Merge the 5 conflict-free unmerged branches into the current branch `docs/0042-continuous-ingestion`.

## Scope

**In scope:**

- `feat/auditor-mutation-probes` (2 commits, 2 files, 0 conflicts)
- `feat/evil-family` (1 commit, 3 files, 0 conflicts)
- `fix/asvs-check-prettier` (1 commit, 1 file, 0 conflicts)
- `fix/changeset-gate-release-pr` (1 commit, 1 file, 0 conflicts)
- `fix/npmrc-scope-publish` (1 commit, 3 files, 0 conflicts)

**Out of scope:**

- Branches with conflicts (feat/asvs-coverage-map, feat/invariant-checks, fix/reviews-hardening-batch)
- Backup branch (backup/reviews-hardening-pre-rebase)
- Already-merged branch (chore/autonomous-docs-system)

## Approach

1. Verify current branch is `docs/0042-continuous-ingestion`
2. Merge each conflict-free branch in order
3. Run gates after each merge (typecheck, lint, format, test)
4. Commit with descriptive message
5. Update state files

## Risks and Mitigations

| Risk                         | Mitigation                           |
| ---------------------------- | ------------------------------------ |
| Merge introduces regressions | Run full gate suite after each merge |
| Pre-commit hooks fail        | Fix issues, never bypass             |

## Rollback Strategy

All merges are local. Reset with `git reset --hard` to pre-merge state if needed.

## Success Criteria

- [ ] All 5 branches merged
- [ ] All gates pass (typecheck, lint, format, test)
- [ ] Changes committed
- [ ] State files updated
