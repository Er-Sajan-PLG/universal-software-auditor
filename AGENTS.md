# AGENTS.md — working in this repository

> This file is the operating manual for agents (and humans) doing work in
> USA itself. It is long on purpose: everything here was learned the hard
> way, and re-learning it costs sessions. Read it fully before your first
> change. Normative statements ("must", "never") are gates, not advice.

## What this repository is

USA (Universal Software Auditor) is a TypeScript CLI (`usa`) that audits
any project and writes a graded Markdown report. It ships as the npm
package `@xenos1996/usa` plus a GitHub composite action. The defining
habit: **the tool audits itself** — every PR runs USA on its own tree,
and the gates below enforce what it preaches. If a change would fail
`usa audit .`, it does not merge.

Key facts: Node with strict TypeScript, vitest suites, ESLint +
Prettier, release-please releases, Conventional Commits (they drive
version bumps). The engine (`src/engine/`) evaluates data-driven rule
packs (`rules/`); the CLI (`src/cli.ts`) is a thin driver over it.

## The Loop (make-or-break — follow it for every change)

1. **Branch** from `master`: `fix/<topic>`, `feat/<topic>`,
   `chore/<topic>`, or `docs/<topic>`. Never commit to `master` directly.
2. **Implement** (see Code conventions). Prefer editing existing files;
   new files only with reason. Keep diffs minimal.
3. **Local gates, all green, before pushing**: `npm run typecheck`,
   `npm run lint`, `npm run format:check`, `npm test`,
   `npm run docs:all`. No exceptions — CI runs the same gates and more.
4. **Commit** with a Conventional Commits subject
   (`fix:`, `feat:`, `chore:`, `docs:` …). Body lines must stay within a
   hundred characters or the commit-msg hook rejects the commit;
   subject-only messages always pass. The hook also runs lint-staged
   (ESLint + Prettier on staged files) — a red hook means fix, not bypass.
5. **Push, open a PR** (fill in the template: what, why, type of change).
   Squash-merge when green, delete the branch.
6. **CI must be fully green before merge.** Eleven-plus checks including
   Test, Lint & format, USA audit (self-audit, fail-on-critical),
   Security scans, CodeQL, Docs & ADR hygiene, Resync generated docs,
   Validate rule packs, Conventional commits, Build.
7. **Merging needs the branch-protection conditions**, not just green
   checks: CODEOWNERS review (`*` owned by the maintainer) and required
   status checks. `gh pr merge` failing with "use administrator
   privileges" means a condition is unmet — get the review, do not pass
   `--admin`. This repo does not bypass its own protection; neither do you.
8. **After merge: follow through.** `fix:`/`feat:` commits make
   release-please open a Release PR. Shepherd it (see Release machinery),
   watch the tag run, verify the registries.

## Bot pushes and the approval limbo (you will hit this weekly)

Runs triggered by bot pushes (release-please branches, dependabot
branches, workflow-created branches) land in CI with every check stuck at
`action_required` and `gh pr checks` reporting nothing. This is GitHub's
approval quarantine, not a failure. As the maintainer, re-run the four
stuck workflows by ID (`gh run rerun <id>`), wait, and the checks go
green. Do not "fix" anything first — there is nothing broken.

Related: dependabot **major** bumps never automerge (correctly). Review
them like any dependency change: minors/patches of dev tools are usually
safe; majors (TypeScript 7, action v3→v4) need a verdict with reasons.
`dependabot.yml` already ignores TypeScript majors — that ignore exists
because v7 is a rewrite that violates the linter's peer range, and the
comment there says so.

## Commands (the gates, exactly)

```bash
npm run typecheck      # tsc --noEmit, strict
npm run lint           # eslint . (complexity budget: max 10 per function)
npm run format:check   # prettier --check . (write with :format)
npm test               # vitest run, full suite
npm run test:cov       # with coverage (thresholds enforced, see below)
npm run build          # tsc emit to dist/
npm run docs:all       # all four doc gates (see Docs hygiene)
npm run self-audit     # build + `usa audit . --out AUDIT.md`
```

`npm run usa -- …` runs the CLI from source without building
(`node --experimental-strip-types`). `AUDIT.md` is gitignored and lands
in the current working directory, never the target being audited.

## Commits and versioning

- Conventional Commits drive release-please: `feat:` → minor,
  `fix:` → patch, `perf:` → patch; `chore:`, `docs:`, `ci:`, `test:`
  release nothing. Anything not matching the format is invisible to the
  release — the hook and the Conventional commits CI job enforce this.
- Keep the subject imperative and scoped (`fix(live): …`).
  Multi-line bodies are allowed but every line must fit the hook's
  length limit; when in doubt, ship subject-only and put rationale in
  the PR body.
- Never amend a failed commit and re-push over hooks; create a new
  commit. Never force-push shared branches.
- Commit often as local savepoints on your branch, even mid-task —
  uncommitted work dies on any `reset --hard`, rebase, or checkout
  mishap, and that loss has happened here before. Savepoints are not
  shipping: push and merge only when a significant, related, reviewable
  whole is complete. Prefer small reviewable PRs; large diffs need an
  explicit review before merging and must stay the exception, not the
  habit.
- Before ANY destructive operation (`reset --hard`, `checkout --`,
  `clean -fd`, branch deletes, stash drops): back up first — a WIP
  commit, a stash push with a name, or a patch file. No exceptions.
  Verifying the backup exists (`git stash list`, `git log`) is part of
  the operation, not optimism about it.

## Tests

- Layout is the scaling contract: `tests/unit/` (pure logic, no I/O),
  `tests/integration/` (real I/O: temp dirs, git, binaries, mocked
  boundaries), `tests/e2e/` (user journeys: CLI via `main()`, full
  sessions and cycles). Shared harnesses stay at `tests/` root
  (`helpers.ts`, `engine-helpers.ts`, …). Classify by behavior, not by
  filename — and the classifier (`classifyTestFile`) recognizes the
  directory layout, so keep it that way.
- Rules for writing tests: no network (stub `fetch`; a test that reaches
  the network fails by construction), deterministic (shuffle-safe —
  proven by experiment, keep it that way), temp dirs cleaned in
  `afterEach`, never write outside `os.tmpdir()`.
- Coverage thresholds are a ratchet (lines/functions/branches/
  statements, configured in `vitest.config.*`): they sit just below
  measured numbers and only ever rise. Never lower them, never exclude
  files to pass.
- Complexity budget is 10 per function (ESLint). If your change pushes a
  function over, extract a helper — do not bump the limit.
- Caught errors keep their `cause` (`preserve-caught-error`); user-facing
  messages stay static where values could leak (provider errors never
  interpolate key material, ids, or endpoints).
- Cosign-dependent tests can flake in sandboxes without the binary or
  network; CI is the arbiter for those, not your laptop.

## CLI conventions (hard-won, all enforced somewhere)

- Every command that writes files honors `--dry-run`: print resolved
  would-write paths, exit 0 before any work. No audit run, no model
  calls, no writes under `--dry-run`, ever.
- Some writers additionally refuse to clobber (`init`, `foundation
init` leave existing files alone with a message). The store is
  content-addressed append-only. Nothing in the CLI deletes user files
  or publishes — signing and publishing live in the release workflow.
- Exit codes: `0` success, `1` findings at/above `--fail-on` (gate),
  `2` usage/validation errors. Errors and usage go to stderr; machine
  output (`--format json`) must parse clean with empty stderr; human
  summaries stay on stdout.
- Stdin answers are capped (64 KiB per line, loud exit 2 over the cap).
  User free text never reaches the model — only sanitized values and
  aggregates — and model turns are fenced as data with an
  instruction-hierarchy guard in the system prompt. The model has no
  tools anywhere; its output goes only to the terminal and the labeled
  transcript.
- Never use `bash` tooling (or code comments) to talk to the user, and
  never `echo` your way through file operations — use the proper file
  tools. Verify your own work by execution: run the code, run the
  tests, show the output. Judge commands by exit codes, never by tailing
  output — an empty tail looks clean while errors hide two lines up.
  This bit twice on real work.

## Docs hygiene (CI enforces all of it)

- `npm run docs:all` runs four gates: ADR hygiene, docs governance
  (claim scanner), CLI reference sync, sample-report sync. All four must
  pass locally before pushing.
- `docs/reference/cli.md` and the sample reports are **generated** — edit
  the sources (help text, generators), rebuild (`npm run build` — CLI
  facts come from `dist/`, and a stale `dist/` bakes stale facts), then
  regenerate and commit the result. The Resync job pushes generated-doc
  fixes back to PR branches itself.
- Shared facts live behind `usa:fact` / `usa:begin…usa:end` markers;
  only rewrite between markers. The claim scanner flags unmarked numeric
  claims — use a marker, reword, or `usa:allow-claim` with reason.
- ADRs are **immutable history**: never edit a merged ADR, never reuse a
  number. New decisions append the next sequential file plus a README
  index entry (`scripts/check-adrs.mjs` enforces numbering, titles,
  dates, and the index).
- `.usa.yaml` holds suppressions (accepted risk, always with a reason —
  visible in reports) and dated reviews (attention with evidence, never
  changing a verdict). Both decay visibly: unused/stale entries warn.
  Prefer reviews over suppressions; suppress only what must stop
  reporting, and say why.

## Configuration policy (`.usa.yaml`)

The file records human judgement, so treat it as carefully as code:
every entry needs a reason a stranger would accept. Suppressions hide
findings repo-wide — never suppress a rule to silence one file unless
the reason covers the whole rule. Reviews attach evidence and an
`until` date; the audit warns when they go stale or match nothing, and
that warning is a task, not noise. Prettier checks the file; the
self-audit validates it.

## Release machinery (read before touching)

- release-please (PAT `RELEASE_PLEASE_TOKEN`, never `GITHUB_TOKEN` —
  token-triggered pushes do not fire downstream workflows) opens Release
  PRs from `feat:`/`fix:` commits. Merge them; the tag run publishes.
- Two registries: npmjs (source of truth, OIDC trusted publishing —
  no long-lived token) and the GitHub Packages mirror (classic PAT
  `GPR_TOKEN` minted on the scope-owning account, because the repo owner
  is not the scope owner). The root `.npmrc` maps the scope at GPR.
- **The `.npmrc` trap**: a scoped registry mapping beats a bare
  `--registry` flag. Any publish leg targeting npmjs must override in
  scoped form. This failed a real release once; the comment in
  `release.yml` tells the story.
- Every release is attested (Sigstore provenance on npmjs, GitHub
  Artifact Attestations), verified (`gh attestation verify` as a job
  gate), and filed under `provenance/` (`v*.sigstore.json` +
  `v*.vsa.json`) through a normal PR — SUP-022/SUP-023 stay green that
  way. Never push `v*` tags by hand.
- If automation wedges, Actions → Release → Run workflow (dispatch)
  publishes whatever `package.json` holds; duplicate versions fail
  closed at the registry. Rollback is documented in `docs/release.md`
  (deprecate + repoint, delete release, delete mirror version) and has
  never been exercised — keep it that way by shipping carefully.
- Secrets live in GitHub settings, never the tree. `.env` is gitignored
  (the CLI loads it for provider keys; the environment always wins).
  GPR reads need a token even for public packages. On any suspected
  leak: rotate first, purge history second.

## Self-audit loop

Run `usa audit .` (or `npm run self-audit`) and read it like a reviewer:
fix HIGHs, record or suppress the rest with evidence, work the
judgement queue per ADR-0023 (assisted items get settled with
`--allow-commands`; judgement items get reasoning). The CI gate fails
on criticals — a red USA audit blocks merge like any red test.

## Architecture map (pointers, not a copy)

- `src/cli.ts` — argument parsing, per-command drivers, help texts.
- `src/engine/` — audit pipeline (load → detect → evaluate → score).
- `src/foundation/` — project-intent interview and detection defaults.
- `src/live/` — conversational sessions; the model boundary lives in
  `runner.ts` (`modelTurn` is the single choke point).
- `src/agent/` — provider presets and the chat transport (OpenAI-shaped,
  text in/out, no tools).
- `src/report/`, `src/detect/`, `src/store/`, `src/evolution/`,
  `src/bootstrap/`, `src/learn/` — as named.
- `rules/` — data-driven packs (`core/`, `stacks/`); adding a rule is a
  YAML change plus fixtures, not engine surgery. See `docs/rule-packs.md`.
- `scripts/` — doc generators and gates (all covered above).
- `provenance/` — per-release Sigstore bundles + verification summaries.
- `docs/ARCHITECTURE.md` — the five stages, the fact system, severity
  dampening, and what USA deliberately does not do. Read it once.

## Review culture

A good review records a verdict **per change** with the reason and the
evidence checked — never a blanket approval. Staged review texts live
outside the repo; what lands in history is the merge and its rationale.
When the automation produces a PR (bundle filings, resyncs), verify
origin, content, and CI — routine does not mean rubber-stamp. When you
find yourself explaining the same thing twice, it belongs in this file.
