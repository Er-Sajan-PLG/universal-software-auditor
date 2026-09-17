/**
 * Pin every `uses:` reference in .github/workflows/ to an immutable commit SHA
 * (OpenSSF Scorecard Pinned-Dependencies, and this repo's own SUP-010).
 *
 * A mutable tag like `actions/checkout@v7` is a standing invitation: whoever
 * controls that ref can move it, and the next run executes their commit with
 * our secrets in scope. A 40-char SHA cannot move.
 *
 * Two details that are easy to get wrong, and both are load-bearing:
 *
 *   1. Annotated tags point at a *tag object*, not a commit. Asking the API for
 *      refs/tags/<tag> and using that SHA pins a non-commit object, which fails
 *      at run time. We dereference through git/tags/<sha> to reach the commit.
 *   2. The trailing `# vX.Y.Z` comment is not decoration. Dependabot cannot
 *      propose an update to a bare SHA — with the comment it can, and raises a
 *      normal PR we review. Without it the pin silently rots.
 *
 * Usage:
 *   node scripts/pin-actions.mjs            # rewrite workflows in place
 *   node scripts/pin-actions.mjs --check    # exit 1 if anything is unpinned
 *
 * `--check` is the CI-facing mode: it makes drift catchable in a PR instead of
 * waiting for the monthly Scorecard run to notice.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const WORKFLOW_DIR = path.join(ROOT, '.github', 'workflows');
const CHECK = process.argv.includes('--check');
const SHA_RE = /^[0-9a-f]{40}$/;

const gh = (...args) =>
  execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/**
 * Resolve an action ref to a commit SHA. Handles annotated tags (the common
 * case for first-party actions) by following the tag object one hop.
 */
function resolveSha(action, ref) {
  const commit = gh('api', `repos/${action}/commits/${ref}`, '--jq', '.sha');
  if (SHA_RE.test(commit)) return commit;

  const refSha = gh('api', `repos/${action}/git/ref/tags/${ref}`, '--jq', '.object.sha');
  const refType = gh('api', `repos/${action}/git/ref/tags/${ref}`, '--jq', '.object.type');
  if (refType === 'tag') {
    const deref = gh('api', `repos/${action}/git/tags/${refSha}`, '--jq', '.object.sha');
    if (SHA_RE.test(deref)) return deref;
  }
  if (SHA_RE.test(refSha)) return refSha;
  throw new Error(`could not resolve ${action}@${ref} to a commit SHA`);
}

const files = fs
  .readdirSync(WORKFLOW_DIR)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .map((f) => path.join(WORKFLOW_DIR, f));

const cache = new Map();
const unresolved = [];
const changes = [];

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  let updated = original;

  // Match `uses: owner/repo[/subpath...]@ref` with an optional trailing
  // comment. The subpath matters: github/codeql-action/init and
  // github/codeql-action/analyze are separate actions in one repository, and
  // a two-segment-only pattern silently skips them.
  //
  // Comment lines are skipped first. A YAML comment that *mentions* the form
  // (`# ... a uses: owner/action@v4 that slipped in`) is prose, not a
  // reference, and matching it makes the checker fail on its own
  // documentation — which it did, immediately, on this repo's ci.yml.
  //
  // Local actions (./path) and docker refs are left alone — there is no ref
  // to resolve and no upstream to track.
  updated = updated.replace(
    /^(\s*#.*)$|(uses:\s*)((?:[\w.-]+\/)+[\w.-]+)@([^\s#]+)(\s*#[^\n]*)?/gm,
    (line, commentLine, prefix, action, ref, comment) => {
      if (commentLine !== undefined) return line;
      if (SHA_RE.test(ref)) return line;

      // owner/repo is the API path; any deeper segments are the action's
      // subdirectory within that repo.
      const segments = action.split('/');
      const repo = `${segments[0]}/${segments[1]}`;

      const key = `${action}@${ref}`;
      if (cache.has(key)) {
        return `${prefix}${action}@${cache.get(key)} # ${ref}`;
      }

      let sha;
      try {
        sha = resolveSha(repo, ref);
      } catch (err) {
        unresolved.push(`${path.relative(ROOT, file)}: ${key} (${err.message})`);
        return line;
      }

      cache.set(key, sha);
      const label = comment ? comment.trim().replace(/^#\s*/, '') : ref;
      changes.push(`${action}@${ref} -> ${sha.slice(0, 12)}…`);
      return `${prefix}${action}@${sha} # ${label}`;
    },
  );

  if (updated !== original && !CHECK) {
    fs.writeFileSync(file, updated);
  }
}

const unique = [...new Set(changes)];

if (CHECK) {
  if (unresolved.length > 0) {
    console.error('Could not resolve the following refs:');
    for (const u of unresolved) console.error(`  ${u}`);
  }
  // Line-by-line, skipping comments, so prose that quotes the syntax is not
  // mistaken for a live reference (see the note in the replace pass above).
  const UNPINNED_RE = /uses:\s*(?:[\w.-]+\/)+[\w.-]+@(?![0-9a-f]{40}\b)/;
  const unpinned = files
    .map((f) => {
      const offending = fs
        .readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => !/^\s*#/.test(line) && UNPINNED_RE.test(line));
      return { f, offending };
    })
    .filter(({ offending }) => offending.length > 0);

  if (unpinned.length > 0) {
    console.error('Unpinned action references found:');
    for (const { f, offending } of unpinned) {
      for (const { line, n } of offending) {
        console.error(`  ${path.relative(ROOT, f)}:${n}  ${line.trim()}`);
      }
    }
    console.error('\nRun `node scripts/pin-actions.mjs` to pin them.');
    process.exit(1);
  }
  console.log('All action references are pinned to commit SHAs.');
  process.exit(0);
}

if (unresolved.length > 0) {
  console.error('Could not resolve the following refs (left unchanged):');
  for (const u of unresolved) console.error(`  ${u}`);
  process.exit(1);
}

console.log(`Pinned ${unique.length} unique action ref(s):`);
for (const c of unique) console.log(`  ${c}`);
