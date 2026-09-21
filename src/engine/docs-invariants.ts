/**
 * Documentation invariants — deterministic, read-only consistency checks
 * that no file-presence rule can express. Each invariant answers a question
 * of the form "does the machine-knowable surface in the source have a home
 * in the documentation?" and reports PASS / FAIL (with locations) /
 * NOT_APPLICABLE.
 *
 * These are the mechanical half of the documentation contract:
 *   - env-var coverage      §6 config docs vs env vars read by the code
 *   - route coverage        §5 API docs vs HTTP routes defined in the code
 *   - docstring coverage    §4 public API vs docstrings / JSDoc
 *   - broken links          §10 relative markdown links that do not resolve
 *   - generated provenance  §14 generated docs without a discoverable
 *                           regeneration path
 *   - changelog consistency §1 package version vs changelog
 *
 * Everything here is a pure function of the project tree + facts: same
 * tree in, same result out (AC-2), and conservative: when a surface exists
 * but cannot be matched to documentation, it is reported (AC-11).
 */
import path from 'node:path';
import type { Facts, Finding, Location, Severity } from '../types.js';
import type { Project } from '../util/project.js';
import { matchesGlob } from '../util/glob.js';

/* --------------------------------------------------------------- shared -- */

/** Source scan excludes: prose, tests, examples, generated output. */
export const CODE_EXCLUDES = [
  '**/*.md',
  '**/*.mdx',
  '**/*.rst',
  'README*',
  '**/README*',
  'docs/**',
  'doc/**',
  'examples/**',
  'example/**',
  'templates/**',
  'fixtures/**',
  '__mocks__/**',
  'test/**',
  'tests/**',
  '__tests__/**',
  'spec/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.stories.*',
  '**/test_*',
  '**/*_test.*',
  'CHANGELOG*',
  'dist/**',
  'build/**',
  'out/**',
  'coverage/**',
  '**/*.min.js',
  '**/*.map',
  '**/*.generated.*',
];

/** Documentation corpus: everywhere a fact may legitimately be documented. */
const DOC_GLOBS = [
  '**/*.md',
  '**/*.mdx',
  '**/*.rst',
  '**/*.txt',
  '**/.env.example',
  '**/.env.*.example',
];

/** Env vars present in virtually every runtime — exempt from the check. */
const ENV_EXEMPT = new Set([
  'NODE_ENV',
  'PATH',
  'HOME',
  'USER',
  'USERNAME',
  'SHELL',
  'PWD',
  'TMPDIR',
  'TEMP',
  'LANG',
  'LC_ALL',
  'TERM',
  'CI',
  'DEBUG',
  'HOSTNAME',
  'OS',
]);

export interface InvariantResult {
  id: string;
  title: string;
  status: 'PASS' | 'FAIL' | 'NOT_APPLICABLE';
  /** Human-readable detail (the report's "Actual:" line). */
  detail: string;
  /** What the contract expects (the "Expected:" line). */
  expected: string;
  /** Where the violation was observed (capped). */
  locations: Location[];
  /** Number of violations beyond the capped location list. */
  extra: number;
  /** Cross-category hint (the "Cross-category:" line). */
  crossCategory?: string;
}

const MAX_LOCATIONS = 15;

function capLocations(locations: Location[]): { shown: Location[]; extra: number } {
  return {
    shown: locations.slice(0, MAX_LOCATIONS),
    extra: Math.max(0, locations.length - MAX_LOCATIONS),
  };
}

function fmtNames(names: string[]): string {
  if (names.length <= 8) return names.join(', ');
  return `${names.slice(0, 8).join(', ')} (+${names.length - 8} more)`;
}

function isExcluded(file: string): boolean {
  return CODE_EXCLUDES.some((g) => matchesGlob(file, g));
}

/**
 * Re-run the extractor regex over the hit line and collect every group.
 * The `g` flag is load-bearing: without it `exec` never advances `lastIndex`
 * and this loops forever on any line that contains a match (observed OOM on
 * a real repo — the same match got pushed unboundedly).
 */
function groupsOf(line: string, pattern: string): string[] {
  const re = new RegExp(pattern, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    for (let g = 1; g < m.length; g++) {
      const v = m[g];
      if (v) out.push(v);
    }
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

/* -------------------------------------------------- 1 · env-var coverage -- */

const ENV_EXTRACTORS: { include: string[]; pattern: string }[] = [
  {
    include: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.jsx',
      '**/*.mjs',
      '**/*.cjs',
      '**/*.mts',
      '**/*.cts',
    ],
    pattern:
      'process\\.env\\.(?:([A-Z][A-Z0-9_]{1,})|\\[\\s*[\'"]([A-Z][A-Z0-9_]{1,})[\'"]\\s*\\])',
  },
  {
    include: ['**/*.py'],
    pattern:
      'os\\.environ(?:\\.get)?\\(\\s*[\'"]([A-Z][A-Z0-9_]{1,})[\'"]|os\\.getenv\\(\\s*[\'"]([A-Z][A-Z0-9_]{1,})[\'"]',
  },
  {
    include: ['**/*.go'],
    pattern: 'os\\.(?:Getenv|LookupEnv)\\(\\s*[\'"]([A-Z][A-Z0-9_]{1,})[\'"]',
  },
  {
    include: ['**/*.rs'],
    pattern: '(?:std::)?env::var(?:_os)?\\(\\s*[\'"]([A-Z][A-Z0-9_]{1,})[\'"]',
  },
  {
    include: ['**/*.c', '**/*.h', '**/*.cc', '**/*.cpp'],
    pattern: 'getenv\\(\\s*[\'"]([A-Z][A-Z0-9_]{1,})[\'"]',
  },
];

/**
 * §6 invariant: every env var read by source code must appear somewhere in
 * the documentation corpus. Conservative by construction — the corpus is
 * every prose file in the repo, so "documented" is the generous reading.
 */
export function checkEnvVarCoverage(project: Project): InvariantResult {
  const used = new Map<string, Location>();
  for (const ex of ENV_EXTRACTORS) {
    for (const hit of project.grep(ex.pattern, ex.include, CODE_EXCLUDES)) {
      for (const name of groupsOf(hit.excerpt, ex.pattern)) {
        if (name.startsWith('NODE_') || ENV_EXEMPT.has(name)) continue;
        if (!used.has(name))
          used.set(name, { file: hit.file, line: hit.line, excerpt: hit.excerpt });
      }
    }
  }
  const names = [...used.keys()].sort();
  const base: InvariantResult = {
    id: 'DOCU-INV-ENV',
    title: 'Every env var read by the code is documented',
    status: 'PASS',
    detail: '',
    expected:
      'Each environment variable read by source code appears in the documentation corpus ' +
      '(docs, README, .env.example) so configuration is discoverable without reading the code.',
    locations: [],
    extra: 0,
    crossCategory:
      '§6 Configuration Documentation → §8 Operations (deployment guides and runbooks copy the same variables).',
  };
  if (names.length === 0) {
    base.status = 'NOT_APPLICABLE';
    base.detail = 'No environment variables found in source code.';
    return base;
  }
  const undocumented = names.filter(
    (n) => !docCorpus(project).some((text) => new RegExp(`\\b${n}\\b`).test(text)),
  );
  if (undocumented.length === 0) {
    base.detail = `All ${names.length} env var(s) found in code are documented.`;
    return base;
  }
  base.status = 'FAIL';
  const { shown, extra } = capLocations(undocumented.map((n) => used.get(n)!));
  base.detail = `${undocumented.length} of ${names.length} env var(s) read by code are not documented: ${fmtNames(undocumented)}`;
  base.locations = shown;
  base.extra = extra;
  return base;
}

/** Concatenated documentation corpus (cached per project root). */
let corpusCache: { key: string; texts: string[] } | null = null;

function docCorpus(project: Project): string[] {
  if (corpusCache && corpusCache.key === project.root) return corpusCache.texts;
  const texts = project
    .glob(DOC_GLOBS)
    .map((f) => project.read(f))
    .filter((t): t is string => t !== null);
  corpusCache = { key: project.root, texts };
  return texts;
}

/* ------------------------------------------------------ 2 · route coverage -- */

// Path characters: `/`, letters, digits, `_`, `-`, `.`, `:`, `{}`, `$`, `*`, `[`, `]`.
const ROUTE_PATH_CLASS = String.raw`[/A-Za-z0-9_.\-:{}$*[\]]*`;

const ROUTE_EXTRACTORS: { include: string[]; pattern: string }[] = [
  {
    // Express / Fastify / Hono / Koa and friends
    include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
    pattern: `\\b(?:app|router|server)\\.(get|post|put|delete|patch|head|options|all)\\(\\s*['"\`](${ROUTE_PATH_CLASS})['"\`]`,
  },
  {
    // Flask / FastAPI decorators
    include: ['**/*.py'],
    pattern: `@(?:app|router|blueprint|bp|api|view)\\.(get|post|put|delete|patch|head|options|route)\\(\\s*['"\`](${ROUTE_PATH_CLASS})['"\`]`,
  },
  {
    // chi / net-http mux / gorilla in Go
    include: ['**/*.go'],
    pattern: `\\b(?:r|router|mux)\\.(Get|Post|Put|Delete|Patch|Handle|HandleFunc|Head|Options)\\(\\s*['"\`](${ROUTE_PATH_CLASS})['"\`]`,
  },
];

const API_DOC_GLOBS = [
  '**/openapi.{yaml,yml,json}',
  '**/swagger.{yaml,yml,json}',
  'docs/api/**',
  'docs/reference/**',
  '**/api-reference*.md',
  '**/api.md',
];

/**
 * §5 invariant: every defined HTTP route (method + path) must be mentioned
 * in the API documentation corpus. Route extraction is deliberately
 * framework-broad and heuristic; false positives are acceptable, false
 * negatives are not (AC-11).
 */
export function checkRouteCoverage(project: Project): InvariantResult {
  const routes = new Map<string, Location & { method: string; path: string }>();
  for (const ex of ROUTE_EXTRACTORS) {
    for (const hit of project.grep(ex.pattern, ex.include, CODE_EXCLUDES)) {
      for (const [method, p] of routePairs(hit.excerpt)) {
        if (!p.startsWith('/') || p.length < 2) continue;
        const key = `${method} ${p}`;
        if (!routes.has(key)) routes.set(key, { method, path: p, file: hit.file, line: hit.line });
      }
    }
  }
  const base: InvariantResult = {
    id: 'DOCU-INV-ROUTES',
    title: 'Every HTTP route is covered by API documentation',
    status: 'PASS',
    detail: '',
    expected:
      'Each defined HTTP route (method + path) is mentioned in the API documentation ' +
      '(OpenAPI spec, docs/api/**, docs/reference/**) so consumers never rely on code archaeology.',
    locations: [],
    extra: 0,
    crossCategory:
      '§5 API Documentation → §10 User-Facing (tutorials and how-to guides that use these routes).',
  };
  if (routes.size === 0) {
    base.status = 'NOT_APPLICABLE';
    base.detail = 'No HTTP routes found in source code.';
    return base;
  }
  const corpus = project
    .glob(API_DOC_GLOBS)
    .map((f) => project.read(f))
    .filter((t): t is string => t !== null);
  if (corpus.length === 0) {
    base.status = 'NOT_APPLICABLE';
    base.detail = `${routes.size} route(s) found but no API documentation corpus exists (see the API reference artifact).`;
    return base;
  }
  const undocumented = [...routes.values()]
    .filter((r) => {
      const norm = r.path.replace(/\/+$/, '');
      return !corpus.some((t) => t.includes(r.path) || (norm.length > 0 && t.includes(norm)));
    })
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  if (undocumented.length === 0) {
    base.detail = `All ${routes.size} route(s) are mentioned in the API documentation.`;
    return base;
  }
  base.status = 'FAIL';
  const { shown, extra } = capLocations(
    undocumented.map((r) => ({ file: r.file, line: r.line, excerpt: `${r.method} ${r.path}` })),
  );
  base.detail = `${undocumented.length} of ${routes.size} route(s) absent from API docs: ${fmtNames(
    undocumented.map((r) => `${r.method} ${r.path}`),
  )}`;
  base.locations = shown;
  base.extra = extra;
  return base;
}

/**
 * Pull (method, path) pairs out of one source line. Mirrors ROUTE_EXTRACTORS
 * exactly (same object names, same quote class) so every line the extractors
 * matched also yields pairs here.
 */
function routePairs(line: string): [string, string][] {
  const out: [string, string][] = [];
  const res = [
    new RegExp(
      `\\b(?:app|router|server)\\.(get|post|put|delete|patch|head|options|all)\\(\\s*['"\`](${ROUTE_PATH_CLASS})['"\`]`,
      'g',
    ),
    new RegExp(
      `@(?:app|router|blueprint|bp|api|view)\\.(get|post|put|delete|patch|head|options|route)\\(\\s*['"\`](${ROUTE_PATH_CLASS})['"\`]`,
      'g',
    ),
    new RegExp(
      `\\b(?:r|router|mux)\\.(Get|Post|Put|Delete|Patch|Handle|HandleFunc|Head|Options)\\(\\s*['"\`](${ROUTE_PATH_CLASS})['"\`]`,
      'g',
    ),
  ];
  for (const re of res) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) out.push([m[1]!.toLowerCase(), m[2]!]);
  }
  return out;
}

/* ------------------------------------------------- 3 · docstring coverage -- */

/**
 * §4 invariant: public top-level definitions carry docstrings. Python: the
 * first non-empty line after a module-level `def` must open a docstring.
 * TS/JS: the first non-empty line above `export function` / `export class`
 * must close a JSDoc block. Heuristic and conservative; private (underscore)
 * members are exempt by convention.
 */
export function checkDocstringCoverage(project: Project, facts: Facts): InvariantResult {
  const missing: Location[] = [];
  if (facts.flags.has('lang:python')) scanPythonDocstrings(project, missing);
  if (facts.flags.has('lang:typescript') || facts.flags.has('lang:javascript')) {
    scanTypeDocstrings(project, missing);
  }
  const hasPy = facts.flags.has('lang:python');
  const hasTs = facts.flags.has('lang:typescript') || facts.flags.has('lang:javascript');
  const base: InvariantResult = {
    id: 'DOCU-INV-DOCS',
    title: 'Public functions and classes carry docstrings',
    status: 'PASS',
    detail: '',
    expected:
      'Every public (non-underscore) top-level function or class has a docstring (Python) or JSDoc (TS/JS).',
    locations: [],
    extra: 0,
    crossCategory:
      '§4 Source Code Documentation → §5 API reference (generated docs inherit these strings).',
  };
  if (!hasPy && !hasTs) {
    base.status = 'NOT_APPLICABLE';
    base.detail = 'No Python or TypeScript/JavaScript sources detected.';
    return base;
  }
  if (missing.length === 0) {
    base.detail = 'All public top-level definitions carry a docstring or JSDoc block.';
    return base;
  }
  base.status = 'FAIL';
  const { shown, extra } = capLocations(missing);
  base.detail = `${missing.length} public definition(s) without a docstring/JSDoc.`;
  base.locations = shown;
  base.extra = extra;
  return base;
}

function hasDocstringBelow(lines: string[], i: number): boolean {
  for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
    const t = lines[j]!.trim();
    if (t === '') continue;
    return t.startsWith('"""') || t.startsWith("'''");
  }
  return false;
}

function scanPythonDocstrings(project: Project, missing: Location[]): void {
  for (const file of project.glob(['**/*.py'])) {
    if (isExcluded(file)) continue;
    const text = project.read(file);
    if (text === null) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i]!.match(/^(?:async )?def ([A-Za-z_][A-Za-z0-9_]*)\(/);
      if (!m || m[1]!.startsWith('_')) continue;
      if (!hasDocstringBelow(lines, i))
        missing.push({ file, line: i + 1, excerpt: `def ${m[1]}(` });
    }
  }
}

function scanTypeDocstrings(project: Project, missing: Location[]): void {
  const globs = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'];
  for (const file of project.glob(globs)) {
    if (isExcluded(file)) continue;
    const text = project.read(file);
    if (text === null) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i]!.match(
        /^export (?:async )?function ([A-Za-z_$][\w$]*)|^export class ([A-Za-z_$][\w$]*)/,
      );
      if (!m) continue;
      let hasDoc = false;
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const t = lines[j]!.trim();
        if (t === '') continue;
        hasDoc = t === '*/';
        break;
      }
      if (!hasDoc) missing.push({ file, line: i + 1, excerpt: `export ${m[1] ?? m[2]}` });
    }
  }
}

/* ------------------------------------------------------- 4 · broken links -- */

const LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;

/**
 * §10 invariant: every relative markdown link resolves to an existing file.
 * Root-relative (`/x`), external, mailto, and pure-anchor links are skipped —
 * they cannot be resolved from the repo alone.
 */
export function checkBrokenLinks(project: Project): InvariantResult {
  const broken: Location[] = [];
  for (const file of project.glob(['**/*.md', '**/*.mdx'])) {
    const text = project.read(file);
    if (text === null) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const found = linkTargets(lines[i]!);
      for (const target of found) {
        if (!targetExists(project, file, target)) {
          broken.push({ file, line: i + 1, excerpt: `→ ${target}` });
        }
      }
    }
  }
  const base: InvariantResult = {
    id: 'DOCU-INV-LINKS',
    title: 'Relative markdown links resolve to files that exist',
    status: 'PASS',
    detail: '',
    expected: 'Every relative link in markdown documentation resolves to an existing file.',
    locations: [],
    extra: 0,
    crossCategory:
      '§10 User-Facing Documentation → §14 Meta-Documentation (sitemap drift starts with dead links).',
  };
  if (broken.length === 0) {
    base.detail = 'No broken relative links found.';
    return base;
  }
  base.status = 'FAIL';
  const { shown, extra } = capLocations(broken);
  base.detail = `${broken.length} broken relative link(s).`;
  base.locations = shown;
  base.extra = extra;
  return base;
}

function linkTargets(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(LINK_RE)) {
    const target = m[1]!.split('#')[0];
    if (!target) continue;
    if (/^(https?:|mailto:|tel:|<)/i.test(target)) continue;
    if (target.startsWith('/')) continue;
    out.push(target);
  }
  return out;
}

/** Directory prefixes derived from the file index (cached per project root). */
let dirCache: { key: string; dirs: Set<string> } | null = null;

function repoDirs(project: Project): Set<string> {
  if (dirCache && dirCache.key === project.root) return dirCache.dirs;
  const dirs = new Set<string>();
  for (const f of project.files) {
    const parts = f.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  dirCache = { key: project.root, dirs };
  return dirs;
}

function targetExists(project: Project, fromFile: string, target: string): boolean {
  const raw = path.posix.join(path.posix.dirname(fromFile), target);
  const segments = raw.split('/');
  const stack: string[] = [];
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      stack.pop();
      continue;
    }
    stack.push(seg);
  }
  const joined = stack.join('/');
  if (!joined) return true;
  // Directory links are valid markdown (they render to the directory page).
  if (repoDirs(project).has(joined)) return true;
  const candidates = new Set([joined]);
  if (!/\.[a-z0-9]+$/i.test(joined)) {
    candidates.add(`${joined}.md`);
    candidates.add(`${joined}.mdx`);
    candidates.add(`${joined}/index.md`);
  }
  return project.files.some((f) => candidates.has(f));
}

/* ------------------------------------------- 5 · generated doc provenance -- */

const GENERATED_HEADER_RE = /generated (?:by|from)|auto-?generated|do not (?:edit|modify)/i;

/**
 * §14 invariant: a file that declares itself generated must have a
 * discoverable regeneration path — its stem must be referenced by a
 * package.json script, a CI workflow, or the Makefile. Otherwise nobody can
 * tell whether it is fresh (AC-5: generated drift).
 */
export function checkGeneratedProvenance(project: Project): InvariantResult {
  const flagged: Location[] = [];
  const scriptText = genScriptText(project);
  for (const file of project.files) {
    if (/\.(lock|map|wasm|png|jpg|jpeg|gif|ico|mp4|webm)$/i.test(file)) continue;
    // templates/** is generator input (its "Generated by" line documents how
    // it is used, not where it comes from); experiments/** are frozen
    // protocol records (EXPERIMENT_PROTOCOL.md), not living generated docs.
    if (file.startsWith('templates/') || file.startsWith('experiments/')) continue;
    const text = project.read(file);
    if (text === null) continue;
    const head = text.split('\n').slice(0, 5).join('\n');
    if (!GENERATED_HEADER_RE.test(head)) continue;
    const stem = path.basename(file).replace(/\.[^.]+$/, '');
    if (stem.length > 2 && scriptText.includes(stem)) continue;
    flagged.push({ file, excerpt: `no script/workflow references "${stem}"` });
  }
  const base: InvariantResult = {
    id: 'DOCU-INV-GEN',
    title: 'Generated documents have a discoverable regeneration path',
    status: 'PASS',
    detail: '',
    expected:
      'Every file marked "generated / do not edit" names a generator that is discoverable in ' +
      'package.json scripts or CI workflows, so drift can be detected and fixed.',
    locations: [],
    extra: 0,
    crossCategory: '§14 Meta-Documentation (toolchain) → any generated target (§1, §5, §7, §9).',
  };
  if (flagged.length === 0) {
    base.detail = 'No generated files without a discoverable regeneration path.';
    return base;
  }
  base.status = 'FAIL';
  const { shown, extra } = capLocations(flagged);
  base.detail = `${flagged.length} generated file(s) without a discoverable regeneration path.`;
  base.locations = shown;
  base.extra = extra;
  return base;
}

/** package.json scripts + CI workflows + Makefile: the discoverable surface. */
function genScriptText(project: Project): string {
  const parts: string[] = [];
  const pkg = project.readJson('package.json') as { scripts?: Record<string, string> } | null;
  if (pkg?.scripts) parts.push(JSON.stringify(pkg.scripts));
  const wfGlobs = [
    '.github/workflows/*.yml',
    '.github/workflows/*.yaml',
    '**/Jenkinsfile',
    '.gitlab-ci.yml',
  ];
  for (const wf of project.glob(wfGlobs)) {
    const t = project.read(wf);
    if (t) parts.push(t);
  }
  const make = project.read('Makefile');
  if (make) parts.push(make);
  return parts.join('\n');
}

/* ------------------------------------------------- 6 · changelog consistency -- */

/**
 * §1 invariant: the changelog must agree with the released version. A tag
 * the changelog has never mentioned means release notes and version history
 * diverged — the exact drift class the contract exists to catch.
 */
export function checkChangelogConsistency(project: Project, gitTags: string[]): InvariantResult {
  const changelogFile = project.glob([
    'CHANGELOG.md',
    'CHANGELOG.rst',
    'CHANGELOG',
    '**/CHANGELOG.md',
  ])[0];
  const base: InvariantResult = {
    id: 'DOCU-INV-CHLOG',
    title: 'Changelog agrees with the released version',
    status: 'PASS',
    detail: '',
    expected:
      'The current package version (and the newest git tag) appears in the changelog, so ' +
      'versioning, changelog, and release notes cannot drift apart silently.',
    locations: [],
    extra: 0,
    crossCategory:
      '§1 Project & Governance → §9 Release & Change Management (release notes inherit it).',
  };
  if (!changelogFile) {
    base.status = 'NOT_APPLICABLE';
    base.detail = 'No changelog file found.';
    return base;
  }
  const text = project.read(changelogFile) ?? '';
  const pkg = project.readJson('package.json') as { version?: string } | null;
  const problems: string[] = [];
  if (pkg?.version && !text.includes(pkg.version)) {
    problems.push(`package.json version ${pkg.version} not found in changelog`);
  }
  const tags = gitTags
    .map((t) => t.replace(/^v/, ''))
    .filter((t) => /^\d+\.\d+\.\d+/.test(t))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (tags.length > 0 && !text.includes(tags[0]!)) {
    problems.push(`newest tag v${tags[0]!} not found in changelog`);
  }
  if (problems.length === 0) {
    base.detail = 'Changelog is consistent with the package version and tags.';
    return base;
  }
  base.status = 'FAIL';
  base.detail = problems.join('; ');
  base.locations = [{ file: changelogFile }];
  return base;
}

/* -------------------------------------------------------------- findings -- */

/**
 * Convert an invariant result into the engine's Finding shape. The SAME
 * function feeds `usa docs audit` and the main audit's DOCU injection, so
 * the gate is identical in both paths (AC-8).
 */
export function invariantToFinding(
  r: InvariantResult,
  severity: Severity,
  dampened: boolean,
): Finding {
  const pass = r.status !== 'FAIL';
  const cross = r.crossCategory ? ` Cross-category: ${r.crossCategory}` : '';
  return {
    ruleId: r.id,
    title: r.title,
    section: 'S12',
    sectionTitle: 'Documentation & Knowledge',
    severity,
    baseSeverity: severity,
    status: pass ? 'PASS' : 'FAIL',
    ruleClass: 'documentation',
    dampened,
    message: pass ? r.detail : `${r.detail}${cross}`,
    locations: pass ? [] : r.locations,
    why: 'The machine already knows these facts; documentation that contradicts or omits them is a correctness defect, not a style issue.',
    remediation: pass
      ? undefined
      : 'Update the documentation to cover the missing surface, then re-run `usa docs audit`.',
    references: ['Docs-as-Code'],
    automatability: 'full',
    tags: ['doc-invariant'],
  };
}
