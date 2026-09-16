# Changesets

This directory is the release note-box. Every PR that should bump the
version drops a small Markdown file here describing the change and the bump
(`patch` / `minor` / `major`). `pnpm changeset version` turns those notes
into version bumps plus `CHANGELOG.md` entries; `pnpm changeset publish`
ships them.

You do not write these by hand. Run:

```bash
pnpm changeset          # interactive: pick packages + bump + summary
```

CI has a `changeset-status` job that fails a PR which changes shipped
files (`src/`, `rules/`, `templates/`, `action.yml`) without adding one.
`chore`, `docs`, `ci`, `test`, and `refactor` PRs may skip it by leaving
the change out of shipped paths — the gate says so explicitly when it
fires.

See `docs/release.md` for the whole chain and why this replaced
release-please.
