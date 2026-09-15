import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadRulePacks } from '../../src/engine/loader.js';

const ROOT = process.cwd();
const INVENTORY = path.join(ROOT, 'rules/catalogues/asvs-5.0-controls.yaml');
const SNAPSHOT = path.join(ROOT, 'tests/fixtures/asvs-coverage-snapshot.json');

function inventory(): Array<{ id: string }> {
  const doc = parseYaml(fs.readFileSync(INVENTORY, 'utf8')) as { controls: Array<{ id: string }> };
  return doc.controls;
}

function citedIds(): Set<string> {
  const { packs } = loadRulePacks(path.join(ROOT, 'rules'));
  const out = new Set<string>();
  for (const pack of packs) {
    for (const rule of pack.rules ?? []) {
      for (const ref of rule.references ?? []) {
        const m = /^ASVS-([\d.]+)$/.exec(ref);
        if (m) out.add(m[1]);
      }
    }
  }
  return out;
}

/**
 * ASVS coverage map guards: the inventory is the denominator, rule
 * references are the claims, and the snapshot makes silent drops a red
 * build. Regenerate both via `node scripts/gen-asvs-coverage.mjs` (the
 * `docs:asvs` gate enforces they are current).
 */
describe('asvs coverage map', () => {
  it('inventory is complete and well-formed', () => {
    const controls = inventory();
    expect(controls.length).toBeGreaterThan(300);
    const ids = controls.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every ASVS-* reference resolves to a real 5.0 control', () => {
    const ids = new Set(inventory().map((c) => c.id));
    const cited = citedIds();
    expect(cited.size).toBeGreaterThan(0);
    for (const id of [...cited].sort()) {
      expect(ids.has(id), `ASVS-${id} cited by rules but absent from the 5.0 inventory`).toBe(true);
    }
  });

  it('coverage never changes without an explicit snapshot regen', () => {
    const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')) as { covered: string[] };
    expect([...citedIds()].sort()).toEqual(snap.covered);
  });
});
