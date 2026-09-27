/**
 * Documentation universe taxonomy — loader and validation.
 *
 * `rules/docs-taxonomy.yaml` (schema usa-doc-taxonomy-v1) is the single
 * machine-readable home for every documentation obligation USA knows:
 * 14 categories, 220 artifact types, ownership class, tier, detection
 * patterns, applicability facts, impact sources, and dependency edges.
 *
 * Honesty discipline mirrors the categories loader (ADR-0033): the loader
 * validates hard and warns on every anomaly; a malformed artifact is skipped
 * (fail closed — it cannot silently satisfy or fail a check), and an unknown
 * `derives_from` / `syncs_with` reference degrades to no edge with a warning.
 */
import { parse as parseYaml } from 'yaml';
import fs from 'node:fs';
import path from 'node:path';
import type { Maturity, Predicate, Severity } from '../types.js';
import { evalPredicate } from './evaluate.js';
import { asMap, isMap, list, num, str, strList } from '../util/yaml.js';
import { matchesGlob } from '../util/glob.js';

/* ------------------------------------------------------------------- types -- */

export const DOC_TAXONOMY_SCHEMA = 'usa-doc-taxonomy-v1';

export type DocKind = 'canonical' | 'derived' | 'generated' | 'reference' | 'example' | 'index';

export const DOC_KINDS: DocKind[] = [
  'canonical',
  'derived',
  'generated',
  'reference',
  'example',
  'index',
];

export interface DocCategory {
  id: string;
  name: string;
}

export interface DocArtifact {
  /** Global number 1..220 (Appendix A ordering). */
  id: number;
  cat: string;
  name: string;
  /** 0..4 — when the artifact is expected (Appendix B policy). */
  tier: number;
  kind: DocKind;
  /** Presence globs; leading `!` negates. Empty = MANUAL (not trackable). */
  patterns: string[];
  /** Optional predicate over detector facts; absent = always applicable. */
  appliesWhen?: Predicate;
  /** Impact globs; `any-source` = any non-document change; absent = none. */
  sources?: string[];
  /** Upstream artifact ids: when upstream is affected, this one is too. */
  derivesFrom: number[];
  /** Peer artifact ids that must stay mutually consistent. */
  syncsWith: number[];
  /** Existing rule id that already reports this artifact's absence. */
  aliasRule?: string;
  notes?: string;
}

export interface DocTaxonomy {
  schema: string;
  categories: DocCategory[];
  artifacts: DocArtifact[];
  byId: Map<number, DocArtifact>;
  categoryOf: Map<number, string>;
  warnings: string[];
}

/* ------------------------------------------------------------ tier policy -- */

/**
 * Appendix B: Tier 0-1 strictly from day one, Tier 2-3 progressively,
 * Tier 4 as the project matures. The expected set per maturity stage:
 *
 *   prototype / legacy  → 0,1
 *   mvp                 → 0,1,2
 *   beta                → 0,1,2,3
 *   production          → 0,1,2,3,4
 */
export const EXPECTED_TIERS: Record<Maturity, number[]> = {
  prototype: [0, 1],
  mvp: [0, 1, 2],
  beta: [0, 1, 2, 3],
  production: [0, 1, 2, 3, 4],
  legacy: [0, 1],
};

/** Severity of a missing artifact that IS expected at the current stage. */
export const TIER_SEVERITY: Record<number, Severity> = {
  0: 'MEDIUM',
  1: 'LOW',
  2: 'LOW',
  3: 'LOW',
  4: 'FUTURE',
};

/* ----------------------------------------------------------------- loading -- */

const VALID_OPS = new Set([
  'exists',
  'absent',
  'eq',
  'neq',
  'in',
  'includes',
  'gt',
  'lt',
  'matches',
]);

/** Shape-only predicate validation (facts are checked at evaluation time). */
function validPredicate(v: unknown, seen: Set<unknown>): boolean {
  if (!isMap(v)) return false;
  if (seen.has(v)) return false; // cycle guard
  seen.add(v);
  const m = v as Record<string, unknown>;
  if (Array.isArray(m.all)) return m.all.every((x) => validPredicate(x, seen));
  if (Array.isArray(m.any)) return m.any.every((x) => validPredicate(x, seen));
  if (m.not !== undefined) return validPredicate(m.not, seen);
  if (typeof m.fact === 'string') {
    if (m.op !== undefined && !VALID_OPS.has(String(m.op))) return false;
    return true;
  }
  return Object.keys(m).length === 0;
}

function parseIntIdList(v: unknown): number[] {
  return (list(v) ?? []).map(Number).filter((n) => Number.isInteger(n));
}

function parseOptionalPredicate(
  m: Record<string, unknown>,
  id: number,
  warnings: string[],
): Predicate | undefined {
  if (m.applies_when === undefined) return undefined;
  if (validPredicate(m.applies_when, new Set())) return m.applies_when as Predicate;
  // Fail closed to "always applicable": a broken applicability predicate
  // would otherwise silently exempt the artifact from every project.
  warnings.push(
    `docs-taxonomy: artifact ${id} has a malformed applies_when — treated as always applicable`,
  );
  return undefined;
}

/**
 * Optional sources list. An explicit `sources: []` is meaningful (nothing
 * machine-invalidates this artifact) and stays silent; a non-list value is
 * malformed and ignored with a warning.
 */
function parseOptionalSources(
  m: Record<string, unknown>,
  id: number,
  warnings: string[],
): string[] | undefined {
  if (m.sources === undefined) return undefined;
  if (!Array.isArray(m.sources)) {
    warnings.push(`docs-taxonomy: artifact ${id} has a malformed sources list — ignored`);
    return undefined;
  }
  return strList(m.sources)!.filter(Boolean);
}

function isArtifactId(v: number | undefined): v is number {
  return v !== undefined && Number.isInteger(v) && v >= 1 && v <= 220;
}

function isTier(v: number | undefined): v is number {
  return v !== undefined && Number.isInteger(v) && v >= 0 && v <= 4;
}

/** Hard validation: id, name, cat, tier, kind. null with a warning on failure. */
function validateArtifactCore(
  m: Record<string, unknown>,
  warnings: string[],
): { id: number; name: string; cat: string; tier: number; kind: DocKind } | null {
  const id = num(m.id);
  if (!isArtifactId(id)) {
    warnings.push(
      `docs-taxonomy: artifact with id ${String(m.id)} is not an integer in 1..220 — skipped`,
    );
    return null;
  }
  const name = str(m.name);
  const cat = str(m.cat);
  const tier = num(m.tier);
  if (!name || !cat || !isTier(tier)) {
    warnings.push(
      `docs-taxonomy: artifact ${id} ("${name ?? '?'}") needs name, cat, tier 0..4 — skipped`,
    );
    return null;
  }
  const kind = str(m.kind) as DocKind | undefined;
  if (!kind || !DOC_KINDS.includes(kind)) {
    warnings.push(`docs-taxonomy: artifact ${id} has unknown kind "${String(kind)}" — skipped`);
    return null;
  }
  return { id, name, cat, tier, kind };
}

function parseArtifact(raw: unknown, warnings: string[]): DocArtifact | null {
  const m = asMap(raw);
  const core = validateArtifactCore(m, warnings);
  if (!core) return null;
  const { id, name, cat, tier, kind } = core;
  const artifact: DocArtifact = {
    id,
    cat,
    name,
    tier,
    kind,
    patterns: (strList(m.patterns) ?? []).filter(Boolean),
    derivesFrom: parseIntIdList(m.derives_from),
    syncsWith: parseIntIdList(m.syncs_with),
  };
  const predicate = parseOptionalPredicate(m, id, warnings);
  if (predicate) artifact.appliesWhen = predicate;
  const sources = parseOptionalSources(m, id, warnings);
  if (sources) artifact.sources = sources;
  const alias = str(m.alias_rule);
  if (alias) artifact.aliasRule = alias;
  const notes = str(m.notes);
  if (notes) artifact.notes = notes;
  return artifact;
}

/**
 * Load and validate the taxonomy. Returns null (with warnings) only when the
 * file is missing or unparsable — in that case the documentation universe
 * is unavailable and the engine says so instead of auditing nothing silently.
 */
export function loadDocTaxonomy(rulesDir: string): {
  taxonomy: DocTaxonomy | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  const file = path.join(rulesDir, 'docs-taxonomy.yaml');
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    warnings.push('docs-taxonomy.yaml not found — documentation universe audit unavailable');
    return { taxonomy: null, warnings };
  }
  let doc: unknown;
  try {
    doc = parseYaml(raw);
  } catch (err) {
    warnings.push(`docs-taxonomy.yaml is not valid YAML: ${(err as Error).message}`);
    return { taxonomy: null, warnings };
  }
  const m = asMap(doc);
  if (str(m.schema) !== DOC_TAXONOMY_SCHEMA) {
    warnings.push(
      `docs-taxonomy.yaml: unknown schema "${str(m.schema) ?? '(none)'}" (expected ${DOC_TAXONOMY_SCHEMA}) — skipped`,
    );
    return { taxonomy: null, warnings };
  }

  const categories: DocCategory[] = (list(m.categories) ?? [])
    .map((c) => {
      const cm = asMap(c);
      return { id: str(cm.id) ?? '', name: str(cm.name) ?? '' };
    })
    .filter((c) => c.id && c.name);
  const catIds = new Set(categories.map((c) => c.id));
  if (catIds.size !== categories.length) {
    warnings.push('docs-taxonomy.yaml: duplicate category ids — duplicates dropped');
  }

  const artifacts = collectArtifacts(m.artifacts, catIds, warnings);

  // Dependency edges: unknown references degrade to no edge, loudly.
  pruneUnknownEdges(artifacts, warnings);

  return {
    taxonomy: {
      schema: DOC_TAXONOMY_SCHEMA,
      categories,
      artifacts,
      byId: new Map(artifacts.map((a) => [a.id, a])),
      categoryOf: new Map(artifacts.map((a) => [a.id, a.cat])),
      warnings,
    },
    warnings,
  };
}

function collectArtifacts(raw: unknown, catIds: Set<string>, warnings: string[]): DocArtifact[] {
  const seen = new Set<number>();
  const artifacts: DocArtifact[] = [];
  for (const entry of list(raw) ?? []) {
    const a = parseArtifact(entry, warnings);
    if (!a) continue;
    if (seen.has(a.id)) {
      warnings.push(`docs-taxonomy: duplicate artifact id ${a.id} — skipped`);
      continue;
    }
    if (!catIds.has(a.cat)) {
      warnings.push(
        `docs-taxonomy: artifact ${a.id} references unknown category "${a.cat}" — skipped`,
      );
      continue;
    }
    seen.add(a.id);
    artifacts.push(a);
  }
  return artifacts.sort((x, y) => x.id - y.id);
}

function pruneUnknownEdges(artifacts: DocArtifact[], warnings: string[]): void {
  const ids = new Set(artifacts.map((a) => a.id));
  for (const a of artifacts) {
    a.derivesFrom = a.derivesFrom.filter((d) => {
      if (ids.has(d)) return true;
      warnings.push(
        `docs-taxonomy: artifact ${a.id} derives_from unknown artifact ${d} — edge dropped`,
      );
      return false;
    });
    a.syncsWith = a.syncsWith.filter((s) => {
      if (ids.has(s)) return true;
      warnings.push(
        `docs-taxonomy: artifact ${a.id} syncs_with unknown artifact ${s} — edge dropped`,
      );
      return false;
    });
  }
}

/** Applicability decision against the detected fact set. */
export function artifactApplies(
  a: DocArtifact,
  facts: { flags: Set<string>; metrics: Record<string, number> },
): boolean {
  return evalPredicate(a.appliesWhen, { flags: facts.flags, metrics: facts.metrics });
}

/**
 * Presence match against the project's indexed file list. Patterns with a
 * leading `!` remove matched files (gitignore-style), so per-module README
 * patterns can exclude the root README. Globs follow the project's own
 * `matchesGlob` semantics (`*`, `**`, `?`, `{a,b}`).
 */
export function matchPatterns(files: string[], patterns: string[]): string[] {
  const positives: string[] = [];
  const negatives: string[] = [];
  for (const p of patterns) {
    if (p.startsWith('!')) negatives.push(p.slice(1));
    else positives.push(p);
  }
  if (positives.length === 0) return [];
  const matched = new Set<string>();
  for (const f of files) {
    if (globMatch(f, positives) && !globMatch(f, negatives)) matched.add(f);
  }
  return [...matched].sort();
}

function globMatch(file: string, patterns: string[]): boolean {
  return patterns.some((p) => (p === '**' || p === '*' ? true : matchesGlob(file, p)));
}
