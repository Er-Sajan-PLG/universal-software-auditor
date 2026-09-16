# Migration: pnpm workspace + changesets (from npm + release-please)

This file is the runbook for the 2026-09 migration. It is deliberately not
listed in `docs/README.md` — it is a history note, not living
documentation. Living docs are `docs/release.md` and
`docs/ci-integration.md`.

## What changed

| Area                 | Before                                                   | After                                                                                  |
| -------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Package manager      | `npm` + `package-lock.json`                              | `pnpm` + `pnpm-lock.yaml` (`--frozen-lockfile` in CI)                                  |
| Workspace            | none                                                     | `pnpm-workspace.yaml`: `.` + `packages/*` (glob reserved, empty today)                 |
| Version bumps        | release-please inferred from commit history              | author-declared `.changeset/*.md` notes                                                |
| Release workflow     | `release-please.yml` (tag cut) → `release.yml` (publish) | `release.yml` (changesets/action: version PR → publish) → `publish.yml` (tag follower) |
| Node in publish legs | 24                                                       | 24 (unchanged; OIDC requires it)                                                       |
| CI cache             | `cache: 'npm'`                                           | `cache: 'pnpm'` + `pnpm/action-setup@v4`                                               |
| Secret               | `RELEASE_PLEASE_TOKEN`                                   | `CHANGESET_TOKEN` (same scopes minus Issues)                                           |
| New CI gate          | —                                                        | `changesets` job: shipped-path PR must add a note                                      |

Version continuity is preserved: `package.json` stays at `2.25.1`, and the
first note above is a `patch`, so the first changesets release is `2.25.2`.

## One-time steps for the maintainer

1. **Create the `CHANGESET_TOKEN` secret.** Fine-grained PAT, this repo
   only, scopes: Contents read+write, Pull requests read+write. Then delete
   `RELEASE_PLEASE_TOKEN` (no workflow reads it anymore).
2. **Rotate the npmjs Trusted Publisher entry** to `workflow: release.yml`
   if it was not already. `publish.yml` runs on tag push and does _not_
   publish to npmjs except on manual dispatch, so only `release.yml` needs
   the trusted-publisher binding for the scheduled path.
3. **Required status checks on `master`:** add `Changeset present`
   (`changesets` job) to the protected-branch list, and remove the
   `Release please` check that no longer exists.
4. **Enable GPR dispatch publishing** only if you use the Publish →
   Run workflow fallback; it needs `GPR_TOKEN` (already present).

## Rollback

The migration is one revert away, and the baseline is tagged:

```bash
# The whole pre-migration tree, frozen:
git tag -l 'backup/pre-pnpm-migration*'
git branch -a | grep backup/pre-pnpm-migration

# Full rollback (do this on a branch and open a PR — never force-push master):
git revert <migration-merge-sha>
```

What a revert restores: `package-lock.json` (delete `pnpm-lock.yaml`),
`release-please.yml` + `.release-please-manifest.json` +
`release-please-config.json`, the old `release.yml`, and the old
`RELEASE_PLEASE_TOKEN` usage. What it cannot restore: any version already
published by changesets. npmjs is fail-closed on duplicates, so a revert
after a changesets release leaves the registry ahead of the reverted config
— reconcile by re-releasing forward, not by deleting.

## Known non-blockers

- `tests/e2e/cli.test.ts` has a 5s per-test timeout that flaps under load
  on machines running the full coverage suite. Verified present on the
  pre-migration baseline (3 failures in one run, 1 in another) — it is
  pre-existing and unrelated to package management. Do not "fix" it by
  raising the timeout without reproducing it first.
- `npm warn Unknown project config "strict-peer-dependencies"` appears when
  an npm command reads the root `.npmrc` (e.g. `npm sbom` in `publish.yml`).
  Harmless: npm ignores pnpm-only keys. It is noise, not a failure.
