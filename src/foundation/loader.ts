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
 *
 * One section per helper — adding a pillar section means adding a function,
 * not growing this one (see docs; the complexity budget is enforced by lint).
 */
export function parseFoundationYamlText(text: string, file: string): FoundationConfig {
  const doc = readYamlDoc(text, file);
  const project = parseProjectSection(doc, file);
  const stage = parseStageValue(doc, file);
  return {
    version: FOUNDATION_VERSION,
    project,
    ...(stage === undefined ? {} : { stage }),
    pillars: parsePillarsSection(doc, project.name, file),
  };
}

/**
 * The declared stage, or undefined when no foundation file (or no stage)
 * exists. Malformed files return undefined silently — the parallel
 * loadFoundationFacts call already warns about the malformation, and one
 * loud line per broken file is enough.
 */
export function loadFoundationStage(target: string): string | undefined {
  const file = foundationFile(path.resolve(target));
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  try {
    return parseFoundationYamlText(text, file).stage;
  } catch {
    return undefined;
  }
}

/** Parse + top-level shape checks, in the order a human debugs them. */
function readYamlDoc(text: string, file: string): Record<string, unknown> {
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
  return doc;
}

/** Defaults carrier: the project name seeds backfill for absent sections. */
function baseFor(name: unknown): FoundationConfig {
  return defaultFoundation(typeof name === 'string' && name ? name : 'project');
}

function parseProjectSection(
  doc: Record<string, unknown>,
  file: string,
): FoundationConfig['project'] {
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
  const base = baseFor(project.name);
  return {
    name: typeof project.name === 'string' ? project.name : base.project.name,
    vision: typeof project.vision === 'string' ? project.vision : '',
    intents: parseIntentsList(project, file),
  };
}

/**
 * A missing list means no intents. Non-string entries are not intents at
 * all: they skip silently (no throw) at the fact boundary via
 * sanitizeIntent. A stray non-string in intents[] asserts nothing.
 */
function parseIntentsList(project: Record<string, unknown>, file: string): string[] {
  if (project.intents === undefined) return [];
  if (!Array.isArray(project.intents)) {
    fail(file, 'expected "project.intents" to be a YAML list');
  }
  return (project.intents as unknown[]).filter((entry) => typeof entry === 'string');
}

function parseStageValue(doc: Record<string, unknown>, file: string): string | undefined {
  if (doc.stage === undefined) return undefined;
  if (typeof doc.stage !== 'string') fail(file, 'expected "stage" to be a string');
  const stage = doc.stage as string;
  if (!(STAGE_OPTIONS as readonly string[]).includes(stage)) {
    fail(
      file,
      `unknown stage ${JSON.stringify(stage)} (expected one of ${STAGE_OPTIONS.join('|')})`,
    );
  }
  return stage;
}

/**
 * A present field is parsed, an absent one backfills — one generic shape for
 * every leaf, so a new leaf is one call, not one branch.
 */
function fieldOr<T>(
  raw: Record<string, unknown>,
  key: string,
  fallback: T,
  file: string,
  where: string,
  parse: (file: string, where: string, value: unknown) => T,
): T {
  const value = raw[key];
  return value === undefined ? fallback : parse(file, where, value);
}

/** A present section must be a mapping; an absent one backfills wholesale. */
function sectionOr(
  pillars: Record<string, unknown>,
  key: string,
  fallback: Record<string, unknown>,
  file: string,
  where: string,
): Record<string, unknown> {
  const value = pillars[key];
  return value === undefined ? fallback : reqMap(file, where, value);
}

function parsePillarsSection(
  doc: Record<string, unknown>,
  name: string,
  file: string,
): FoundationConfig['pillars'] {
  if (doc.pillars !== undefined && !isMap(doc.pillars)) {
    fail(file, 'expected "pillars" to be a YAML mapping');
  }
  const base = baseFor(name);
  const pillars = asMap(doc.pillars);
  return {
    docs: {
      required: fieldOr(
        sectionOr(pillars, 'docs', { ...base.pillars.docs }, file, 'pillars.docs'),
        'required',
        [...base.pillars.docs.required],
        file,
        'pillars.docs.required',
        reqStrList,
      ),
    },
    governance: parseGovernancePillar(pillars, base, file),
    ai: parseAiPillar(pillars, base, file),
    testing: parseTestingPillar(pillars, base, file),
    environment: {
      files: fieldOr(
        sectionOr(
          pillars,
          'environment',
          { ...base.pillars.environment },
          file,
          'pillars.environment',
        ),
        'files',
        [...base.pillars.environment.files],
        file,
        'pillars.environment.files',
        reqStrList,
      ),
    },
    pipelines: parsePipelinesPillar(pillars, base, file),
    standards: fieldOr(pillars, 'standards', [] as string[], file, 'pillars.standards', reqStrList),
    specs: fieldOr(pillars, 'specs', [] as string[], file, 'pillars.specs', reqStrList),
  };
}

/** One boolean leaf per call — a new governance promise is one line. */
function parseGovernancePillar(
  pillars: Record<string, unknown>,
  base: FoundationConfig,
  file: string,
): FoundationConfig['pillars']['governance'] {
  const raw = sectionOr(
    pillars,
    'governance',
    { ...base.pillars.governance },
    file,
    'pillars.governance',
  );
  const fallback = base.pillars.governance;
  return {
    codeOfConduct: fieldOr(
      raw,
      'codeOfConduct',
      fallback.codeOfConduct,
      file,
      'pillars.governance.codeOfConduct',
      reqBool,
    ),
    contributing: fieldOr(
      raw,
      'contributing',
      fallback.contributing,
      file,
      'pillars.governance.contributing',
      reqBool,
    ),
    securityPolicy: fieldOr(
      raw,
      'securityPolicy',
      fallback.securityPolicy,
      file,
      'pillars.governance.securityPolicy',
      reqBool,
    ),
    license: fieldOr(raw, 'license', fallback.license, file, 'pillars.governance.license', reqBool),
  };
}

function parseAiPillar(
  pillars: Record<string, unknown>,
  base: FoundationConfig,
  file: string,
): FoundationConfig['pillars']['ai'] {
  const raw = sectionOr(pillars, 'ai', { ...base.pillars.ai }, file, 'pillars.ai');
  return {
    readable: fieldOr(
      raw,
      'readable',
      base.pillars.ai.readable,
      file,
      'pillars.ai.readable',
      reqBool,
    ),
    writable: fieldOr(
      raw,
      'writable',
      base.pillars.ai.writable,
      file,
      'pillars.ai.writable',
      reqBool,
    ),
  };
}

function parseTestingPillar(
  pillars: Record<string, unknown>,
  base: FoundationConfig,
  file: string,
): FoundationConfig['pillars']['testing'] {
  const raw = sectionOr(pillars, 'testing', { ...base.pillars.testing }, file, 'pillars.testing');
  const dirs = fieldOr(
    raw,
    'dirs',
    [...base.pillars.testing.dirs],
    file,
    'pillars.testing.dirs',
    reqStrList,
  );
  const minCoverage = parseCoverageBar(raw, base, file);
  return { dirs, ...(minCoverage === undefined ? {} : { minCoverage }) };
}

/** `null` is how the renderer writes a cleared threshold; both mean "no bar". */
function parseCoverageBar(
  raw: Record<string, unknown>,
  base: FoundationConfig,
  file: string,
): number | undefined {
  const value = raw['minCoverage'];
  if (value === undefined || value === null) return base.pillars.testing.minCoverage;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    fail(file, 'expected "pillars.testing.minCoverage" to be a number from 0 to 100');
  }
  return value as number;
}

function parsePipelinesPillar(
  pillars: Record<string, unknown>,
  base: FoundationConfig,
  file: string,
): FoundationConfig['pillars']['pipelines'] {
  const raw = sectionOr(
    pillars,
    'pipelines',
    { ...base.pillars.pipelines },
    file,
    'pillars.pipelines',
  );
  return {
    ci: fieldOr(
      raw,
      'ci',
      [...base.pillars.pipelines.ci],
      file,
      'pillars.pipelines.ci',
      reqStrList,
    ),
    local: fieldOr(
      raw,
      'local',
      [...base.pillars.pipelines.local],
      file,
      'pillars.pipelines.local',
      reqStrList,
    ),
  };
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
