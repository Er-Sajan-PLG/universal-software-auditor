import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { RulePack } from '../types.js';

/**
 * Assurance categories (the future-ready categorization axis).
 *
 * `rules/categories.yaml` (schema `usa-categories-v1`) groups the sixteen
 * report sections and the rule-id prefixes into ten stable categories.
 * Categories never replace sections and never change scoring: like
 * catalogues (ADR-0021), coverage here is *derived* from data that already
 * exists — a rule belongs to a category when its id starts with one of the
 * category's `rulePrefixes`. No rule needs a new field, so the mapping
 * cannot drift from the rule ids that justify it.
 *
 * Honesty discipline: every description states IMPLEMENTED (real rules
 * mapped) or PROPOSED (aspirational, none yet). The loader enforces this —
 * an entry without either label is skipped with a warning.
 */

/** The frozen category set. Adding an id is a taxonomy change, not a patch. */
export const CATEGORY_IDS = [
  'foundational',
  'security',
  'networking',
  'communication',
  'ux',
  'vision',
  'technical-sota',
  'architecture',
  'standards',
  'protocol',
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface CategoryDef {
  id: string;
  name: string;
  description: string;
  sections: string[];
  rulePrefixes: string[];
}

/** Derived coverage for one category — counts only, no scoring input. */
export interface CategoryCoverage {
  id: string;
  name: string;
  ruleCount: number;
  sections: string[];
}

const CATEGORIES_FILE = 'categories.yaml';
const CATEGORIES_SCHEMA = 'usa-categories-v1';

/** Load and validate the category registry. Entries keep file order. */
export function loadCategories(rulesDir: string): {
  categories: CategoryDef[];
  warnings: string[];
} {
  const file = path.join(rulesDir, CATEGORIES_FILE);
  const warnings: string[] = [];
  if (!fs.existsSync(file)) {
    warnings.push(`${CATEGORIES_FILE} not found — categories unavailable`);
    return { categories: [], warnings };
  }
  let raw: unknown;
  try {
    raw = parseYaml(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    warnings.push(`${CATEGORIES_FILE} is not valid YAML (${(err as Error).message}) — ignored`);
    return { categories: [], warnings };
  }
  const doc = (raw ?? {}) as { schema?: unknown; categories?: unknown };
  if (doc.schema !== CATEGORIES_SCHEMA) {
    warnings.push(`${CATEGORIES_FILE}: expected schema "${CATEGORIES_SCHEMA}" — registry ignored`);
    return { categories: [], warnings };
  }
  if (!Array.isArray(doc.categories)) {
    warnings.push(`${CATEGORIES_FILE}: "categories" must be a list — ignored`);
    return { categories: [], warnings };
  }
  const categories: CategoryDef[] = [];
  const seen = new Set<string>();
  for (const entry of doc.categories) {
    const parsed = parseCategoryEntry(entry, seen, warnings);
    if (parsed) categories.push(parsed);
  }
  for (const id of CATEGORY_IDS) {
    if (!seen.has(id)) warnings.push(`${CATEGORIES_FILE}: category "${id}" is not defined`);
  }
  return { categories, warnings };
}

/** Parse one registry entry; null (with a warning) when it is unusable. */
function parseCategoryEntry(
  entry: unknown,
  seen: Set<string>,
  warnings: string[],
): CategoryDef | null {
  const c = (entry ?? {}) as Record<string, unknown>;
  const id = readCategoryId(c, seen, warnings);
  if (!id) return null;
  const description = readCategoryDescription(c, id, warnings);
  if (description === null) return null;
  seen.add(id);
  return {
    id,
    name: typeof c.name === 'string' && c.name.trim() ? c.name : id,
    description,
    sections: asStringList(c.sections, id, 'sections', warnings),
    rulePrefixes: asStringList(c.rulePrefixes, id, 'rulePrefixes', warnings),
  };
}

function readCategoryId(
  c: Record<string, unknown>,
  seen: Set<string>,
  warnings: string[],
): string | null {
  const id = typeof c.id === 'string' ? c.id.trim() : '';
  if (!id) {
    warnings.push(`${CATEGORIES_FILE}: an entry is missing "id" — skipped`);
    return null;
  }
  if (seen.has(id)) {
    warnings.push(`${CATEGORIES_FILE}: duplicate category id "${id}" — later ignored`);
    return null;
  }
  if (!(CATEGORY_IDS as readonly string[]).includes(id)) {
    warnings.push(`${CATEGORIES_FILE}: unknown category id "${id}" — skipped`);
    return null;
  }
  return id;
}

function readCategoryDescription(
  c: Record<string, unknown>,
  id: string,
  warnings: string[],
): string | null {
  const description = typeof c.description === 'string' ? c.description : '';
  if (!description) {
    warnings.push(`${CATEGORIES_FILE}: category "${id}" has no description — skipped`);
    return null;
  }
  if (!/\bIMPLEMENTED\b/.test(description) && !/\bPROPOSED\b/.test(description)) {
    // The honesty label is load-bearing: without it a reader cannot tell a
    // thin axis from a covered one, so the entry fails closed like any other
    // malformed input (ADR-0009).
    warnings.push(
      `${CATEGORIES_FILE}: category "${id}" states neither IMPLEMENTED nor PROPOSED — skipped`,
    );
    return null;
  }
  return description;
}

function asStringList(value: unknown, id: string, field: string, warnings: string[]): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push(`${CATEGORIES_FILE}: category "${id}" field "${field}" must be a list — ignored`);
    return [];
  }
  return value.map(String);
}

/**
 * Tally loaded rules per category. A rule belongs to every category whose
 * `rulePrefixes` it matches (prefix `SEC-` matches `SEC-001`); aspirational
 * categories with no prefixes honestly report zero. Deterministic and pure.
 */
export function categoryCoverage(packs: RulePack[], categories: CategoryDef[]): CategoryCoverage[] {
  const ids: string[] = [];
  for (const pack of packs) {
    for (const rule of pack.rules ?? []) ids.push(rule.id);
  }
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    ruleCount: ids.filter((id) => c.rulePrefixes.some((p) => p !== '' && id.startsWith(p))).length,
    sections: [...c.sections],
  }));
}
