/**
 * Documentation impact analysis — semantic dependency model.
 *
 * Answers the Phase 3 questions with deterministic mechanisms:
 *   - What docs (across all 14 categories) are affected by changing file X?
 *   - Which sources does document Y describe?
 *
 * Impact classes, all computed from the taxonomy's declarative edges:
 *   direct          source → its documentation (artifact.sources match)
 *   transitive      source → intermediate artifact → downstream docs
 *                   (BFS over derives_from edges, bounded)
 *   cross-category  any edge that crosses a category boundary is flagged
 *   sync            peers declared in syncs_with must move together
 *
 * Conservative by construction (AC-11): `any-source` artifacts (README,
 * changelog, user guide) are hit by every non-document change, and a changed
 * document invalidates its sync partners and everything that derives from it.
 * Uncertainty resolves to "affected", never to "fine".
 */
import type { Facts } from '../types.js';
import { matchesGlob } from '../util/glob.js';
import {
  artifactApplies,
  matchPatterns,
  type DocArtifact,
  type DocTaxonomy,
} from './docs-taxonomy.js';

export interface ImpactEntry {
  artifact: DocArtifact;
  /** Human-readable reasons, sorted (deterministic). */
  reasons: string[];
  /** Changed files that triggered the impact, sorted. */
  triggeredBy: string[];
  /** True when at least one traversed edge crossed a category boundary. */
  crossCategory: boolean;
}

export interface ImpactResult {
  changed: string[];
  affected: ImpactEntry[];
  /** Changed files with no detected documentation impact. */
  noImpact: string[];
  /** Number of dependency edges traversed during the transitive walk. */
  edgesTraversed: number;
}

const DOC_FILE_RE = /\.(md|mdx|rst|txt|adoc)$/i;

function isDocFile(file: string): boolean {
  return DOC_FILE_RE.test(file) || /^README/i.test(basename(file)) || file.startsWith('docs/');
}

function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? p : p.slice(i + 1);
}

/** True when a changed file matches any of the artifact's presence globs. */
function changedDocOf(file: string, a: DocArtifact): boolean {
  return matchPatterns([file], a.patterns).length > 0;
}

interface HitEntry {
  reasons: Set<string>;
  triggeredBy: Set<string>;
  crossCategory: boolean;
}

type HitMap = Map<number, HitEntry>;

/** Adjacency: upstream id → dependents (D derives_from A ⇒ A's change hits D). */
function buildDependents(taxonomy: DocTaxonomy): Map<number, number[]> {
  const dependents = new Map<number, number[]>();
  for (const a of taxonomy.artifacts) {
    for (const up of a.derivesFrom) {
      const arr = dependents.get(up) ?? [];
      arr.push(a.id);
      dependents.set(up, arr);
    }
  }
  return dependents;
}

function makeTouch(hit: HitMap) {
  return (id: number, reason: string, file?: string, cross = false) => {
    const e = hit.get(id) ?? {
      reasons: new Set<string>(),
      triggeredBy: new Set<string>(),
      crossCategory: false,
    };
    e.reasons.add(reason);
    if (file) e.triggeredBy.add(file);
    e.crossCategory = e.crossCategory || cross;
    hit.set(id, e);
  };
}

/** Pass 1 · direct impact: source globs and self-changed documents. */
function directHits(changed: string[], applicable: DocArtifact[], hit: HitMap): Set<number> {
  const touch = makeTouch(hit);
  const directIds = new Set<number>();
  for (const f of changed) {
    const doc = isDocFile(f);
    for (const a of applicable) {
      for (const g of a.sources ?? []) {
        if (g === 'any-source') {
          if (!doc) touch(a.id, 'any source change invalidates this artifact', f);
          continue;
        }
        if (matchesGlob(f, g)) touch(a.id, `source pattern ${g} matches ${f}`, f);
      }
      if (changedDocOf(f, a)) touch(a.id, `the document itself changed (${f})`, f);
      directIds.add(a.id);
    }
  }
  return directIds;
}

interface ClosureState {
  byId: Map<number, DocArtifact>;
  dependents: Map<number, number[]>;
  hit: HitMap;
  queued: Set<number>;
  edges: number;
}

/** Follow one neighbor edge: record it, queue the target if new. */
function followEdge(
  state: ClosureState,
  from: DocArtifact,
  to: number,
  label: string,
  queue: number[],
): void {
  const t = state.byId.get(to);
  if (!t) return;
  state.edges++;
  const existed = state.hit.has(to);
  makeTouch(state.hit)(to, `${label} ${from.name} (#${from.id})`, undefined, t.cat !== from.cat);
  if (!existed && !state.queued.has(to)) {
    state.queued.add(to);
    queue.push(to);
  }
}

/** Pass 2 · transitive closure over derives_from + syncs_with (bounded BFS). */
function expandClosure(
  taxonomy: DocTaxonomy,
  dependents: Map<number, number[]>,
  hit: HitMap,
  seed: Set<number>,
): number {
  const queue = [...seed].sort();
  const state: ClosureState = {
    byId: taxonomy.byId,
    dependents,
    hit,
    queued: new Set(queue),
    edges: 0,
  };
  while (queue.length > 0) {
    const a = state.byId.get(queue.shift()!);
    if (!a) continue;
    for (const dep of dependents.get(a.id) ?? []) followEdge(state, a, dep, 'derives from', queue);
    for (const partner of a.syncsWith) followEdge(state, a, partner, 'syncs with', queue);
  }
  return state.edges;
}

function assemble(
  byId: Map<number, DocArtifact>,
  hit: HitMap,
  changed: string[],
  edges: number,
): ImpactResult {
  const affected: ImpactEntry[] = [...hit.entries()]
    .map(([id, e]) => ({
      artifact: byId.get(id)!,
      reasons: [...e.reasons].sort(),
      triggeredBy: [...e.triggeredBy].sort(),
      crossCategory: e.crossCategory,
    }))
    .sort((x, y) => x.artifact.id - y.artifact.id);
  const impactedFiles = new Set<string>();
  for (const e of affected) for (const f of e.triggeredBy) impactedFiles.add(f);
  return {
    changed,
    affected,
    noImpact: changed.filter((f) => !impactedFiles.has(f)),
    edgesTraversed: edges,
  };
}

/**
 * Compute the documentation impact of a set of changed files.
 *
 * Pure function of (project index, taxonomy, facts, changed files) — the
 * same change set always yields the same impact report (AC-2), and the
 * computation is O(artifacts × changed × globs): bounded and fast.
 */
export function analyzeImpact(
  taxonomy: DocTaxonomy,
  facts: Facts,
  changedFiles: string[],
): ImpactResult {
  const changed = [...new Set(changedFiles)].sort();
  const applicable = taxonomy.artifacts.filter((a) => artifactApplies(a, facts));
  const hit: HitMap = new Map();
  const dependents = buildDependents(taxonomy);
  const direct = directHits(changed, applicable, hit);
  const edges = expandClosure(taxonomy, dependents, hit, direct);
  return assemble(taxonomy.byId, hit, changed, edges);
}

export interface DescribeResult {
  file: string;
  /** Artifacts whose source globs this file can invalidate. */
  invalidates: DocArtifact[];
  /** Artifacts this file is a document of (its own presence patterns). */
  documents: DocArtifact[];
  /** Downstream artifacts that derive from documents of this file. */
  downstream: DocArtifact[];
}

/**
 * Reverse query: for one file, which documentation relationship exists?
 * "Which sources does document Y describe?" is `invalidates`; "what does Y
 * feed?" is `downstream`.
 */
export function describeFile(taxonomy: DocTaxonomy, facts: Facts, file: string): DescribeResult {
  const applicable = taxonomy.artifacts.filter((a) => artifactApplies(a, facts));
  const invalidates = applicable.filter((a) => {
    if (!a.sources) return false;
    return a.sources.some((g) => (g === 'any-source' ? !isDocFile(file) : matchesGlob(file, g)));
  });
  const documents = applicable.filter((a) => changedDocOf(file, a));
  const downstream: DocArtifact[] = [];
  const seen = new Set<number>();
  for (const d of documents) {
    const queue = [d.id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const a of taxonomy.artifacts) {
        if (a.derivesFrom.includes(id) && !seen.has(a.id)) {
          seen.add(a.id);
          downstream.push(a);
          queue.push(a.id);
        }
      }
    }
  }
  downstream.sort((x, y) => x.id - y.id);
  return { file, invalidates, documents, downstream };
}
