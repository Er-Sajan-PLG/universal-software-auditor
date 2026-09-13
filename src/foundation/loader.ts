/**
 * Deterministic loader for the foundation intent file.
 *
 * Contract (fail-closed):
 * - Missing `<root>/.usa/foundation.yaml` → `[]` (no intent, no facts).
 * - Malformed YAML, unparseable dates, or unknown shapes → push nothing and
 *   THROW a loud Error naming the file. The caller (coordinator) converts the
 *   throw into an audit warning; we never silently audit against half an
 *   intent, so `loadFoundationFacts` either returns clean facts or throws.
 * - Intent entries that do not sanitize to `lowercase [a-z0-9-]+` are skipped
 *   silently (no throw): a sloppy label must not fail the whole audit, it
 *   simply asserts nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  FOUNDATION_BASENAME,
  FOUNDATION_DIR,
  FOUNDATION_VERSION,
  STAGE_OPTIONS,
  defaultFoundation,
  type FoundationConfig,
} from './types.js';
import { asMap, isMap } from '../util/yaml.js';

export function foundationFile(root: string): string {
  return path.join(root, FOUNDATION_DIR, FOUNDATION_BASENAME);
}

const INTENT_RE = /^[a-z0-9-]+$/;

/**
 * Sanitizes one raw intents[] entry to an `intent:<value>` flag, or
 * `undefined` when the entry is not usable. Never throws.
 */
export function sanitizeIntent(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const slug = value.trim().toLowerCase();
  if (!slug || !INTENT_RE.test(slug)) return undefined;
  return `intent:${slug}`;
}

function fail(file: string, reason: string): never {
  throw new Error(`${file}: ${reason}`);
}

function hasDate(value: unknown): boolean {
  if (value instanceof Date) return true;
  if (Array.isArray(value)) return value.some(hasDate);
  if (isMap(value)) return Object.values(value).some(hasDate);
  return false;
}

function reqMap(file: string, where: string, value: unknown): Record<string, unknown> {
  if (!isMap(value)) fail(file, `expected "${where}" to be a YAML mapping`);
  return value as Record<string, unknown>;
}

function reqStrList(file: string, where: string, value: unknown): string[] {
  if (!Array.isArray(value)) fail(file, `expected "${where}" to be a YAML list`);
  return value.map((entry) => String(entry));
}

function reqBool(file: string, where: string, value: unknown): boolean {
  if (typeof value !== 'boolean') fail(file, `expected "${where}" to be true/false`);
  return value;
}

/**
 * Strictly parses foundation YAML text into a FoundationConfig. Unknown
 * shapes throw; absent pillar sections backfill from defaults so the result
 * always satisfies the schema. Exported for `foundation show` and tests.
 */
export function parseFoundationYamlText(text: string, file: string): FoundationConfig {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    fail(file, `malformed YAML (${(err as Error).message})`);
  }
  if (!isMap(raw)) fail(file, 'expected a YAML mapping at the top level');
  if (hasDate(raw)) fail(file, 'unparseable date value (quote date-like strings)');
  const doc = raw as Record<string, unknown>;

  if (doc.version !== FOUNDATION_VERSION) {
    fail(file, `unsupported version ${JSON.stringify(doc.version)} (expected 1)`);
  }
  if (!isMap(doc.project)) fail(file, 'missing or invalid "project" mapping');
  const project = doc.project as Record<string, unknown>;
  if (project.name !== undefined && typeof project.name !== 'string') {
    fail(file, 'expected "project.name" to be a string');
  }
  if (project.vision !== undefined && typeof project.vision !== 'string') {
    fail(file, 'expected "project.vision" to be a string');
  }
  if (project.intents !== undefined && !Array.isArray(project.intents)) {
    fail(file, 'expected "project.intents" to be a YAML list');
  }
  // Non-string entries are not intents at all: they skip silently (no throw)
  // at the fact boundary via sanitizeIntent. Pillars stay lenient (String())
  // because a stray number in a file list is harmless; a stray non-string in
  // intents[] asserts nothing.
  const intents =
    project.intents === undefined
      ? []
      : (project.intents as unknown[]).filter((entry) => typeof entry === 'string');

  let stage: string | undefined;
  if (doc.stage !== undefined) {
    if (typeof doc.stage !== 'string') fail(file, 'expected "stage" to be a string');
    stage = doc.stage as string;
    if (!(STAGE_OPTIONS as readonly string[]).includes(stage)) {
      fail(
        file,
        `unknown stage ${JSON.stringify(stage)} (expected one of ${STAGE_OPTIONS.join('|')})`,
      );
    }
  }

  if (doc.pillars !== undefined && !isMap(doc.pillars)) {
    fail(file, 'expected "pillars" to be a YAML mapping');
  }

  // Absent sections backfill from defaults; present-but-misshapen throws.
  const base = defaultFoundation(
    typeof project.name === 'string' && project.name ? project.name : 'project',
  );
  const pillars = asMap(doc.pillars);

  const docsRaw =
    pillars.docs === undefined ? base.pillars.docs : reqMap(file, 'pillars.docs', pillars.docs);
  const govRaw =
    pillars.governance === undefined
      ? { ...base.pillars.governance }
      : reqMap(file, 'pillars.governance', pillars.governance);
  const aiRaw =
    pillars.ai === undefined ? { ...base.pillars.ai } : reqMap(file, 'pillars.ai', pillars.ai);
  const testingRaw =
    pillars.testing === undefined
      ? { ...base.pillars.testing }
      : reqMap(file, 'pillars.testing', pillars.testing);
  const envRaw =
    pillars.environment === undefined
      ? { ...base.pillars.environment }
      : reqMap(file, 'pillars.environment', pillars.environment);
  const pipeRaw =
    pillars.pipelines === undefined
      ? { ...base.pillars.pipelines }
      : reqMap(file, 'pillars.pipelines', pillars.pipelines);

  const testingDirs =
    testingRaw.dirs === undefined
      ? [...base.pillars.testing.dirs]
      : reqStrList(file, 'pillars.testing.dirs', testingRaw.dirs);
  let minCoverage = base.pillars.testing.minCoverage;
  // `null` is how the renderer writes a cleared threshold; both mean "no bar".
  if (testingRaw.minCoverage !== undefined && testingRaw.minCoverage !== null) {
    const n = testingRaw.minCoverage;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100) {
      fail(file, 'expected "pillars.testing.minCoverage" to be a number from 0 to 100');
    }
    minCoverage = n as number;
  }

  const config: FoundationConfig = {
    version: FOUNDATION_VERSION,
    project: {
      name: typeof project.name === 'string' ? project.name : base.project.name,
      vision: typeof project.vision === 'string' ? project.vision : '',
      intents,
    },
    pillars: {
      docs: {
        required:
          docsRaw.required === undefined
            ? [...base.pillars.docs.required]
            : reqStrList(file, 'pillars.docs.required', docsRaw.required),
      },
      governance: {
        codeOfConduct:
          govRaw.codeOfConduct === undefined
            ? base.pillars.governance.codeOfConduct
            : reqBool(file, 'pillars.governance.codeOfConduct', govRaw.codeOfConduct),
        contributing:
          govRaw.contributing === undefined
            ? base.pillars.governance.contributing
            : reqBool(file, 'pillars.governance.contributing', govRaw.contributing),
        securityPolicy:
          govRaw.securityPolicy === undefined
            ? base.pillars.governance.securityPolicy
            : reqBool(file, 'pillars.governance.securityPolicy', govRaw.securityPolicy),
        license:
          govRaw.license === undefined
            ? base.pillars.governance.license
            : reqBool(file, 'pillars.governance.license', govRaw.license),
      },
      ai: {
        readable:
          aiRaw.readable === undefined
            ? base.pillars.ai.readable
            : reqBool(file, 'pillars.ai.readable', aiRaw.readable),
        writable:
          aiRaw.writable === undefined
            ? base.pillars.ai.writable
            : reqBool(file, 'pillars.ai.writable', aiRaw.writable),
      },
      testing: { dirs: testingDirs, ...(minCoverage === undefined ? {} : { minCoverage }) },
      environment: {
        files:
          envRaw.files === undefined
            ? [...base.pillars.environment.files]
            : reqStrList(file, 'pillars.environment.files', envRaw.files),
      },
      pipelines: {
        ci:
          pipeRaw.ci === undefined
            ? [...base.pillars.pipelines.ci]
            : reqStrList(file, 'pillars.pipelines.ci', pipeRaw.ci),
        local:
          pipeRaw.local === undefined
            ? [...base.pillars.pipelines.local]
            : reqStrList(file, 'pillars.pipelines.local', pipeRaw.local),
      },
      standards:
        pillars.standards === undefined
          ? []
          : reqStrList(file, 'pillars.standards', pillars.standards),
      specs: pillars.specs === undefined ? [] : reqStrList(file, 'pillars.specs', pillars.specs),
    },
  };
  if (stage !== undefined) config.stage = stage;
  return config;
}

/**
 * Reads `<root>/.usa/foundation.yaml` and returns one `intent:<value>` flag
 * per usable intents[] entry. Missing file → `[]`. Anything broken → throws.
 */
export function loadFoundationFacts(root: string): string[] {
  const file = foundationFile(root);
  if (!fs.existsSync(file)) return [];
  const config = parseFoundationYamlText(fs.readFileSync(file, 'utf8'), file);
  const facts: string[] = [];
  for (const entry of config.project.intents) {
    const flag = sanitizeIntent(entry);
    if (flag !== undefined) facts.push(flag);
  }
  return facts;
}
