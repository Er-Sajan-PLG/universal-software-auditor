import type { Finding } from '../types.js';

/**
 * Foundation readiness section (FND-* rule pack).
 *
 * Frozen contract with the interview/loader and rule-pack workers: a
 * foundation finding is a report finding whose `ruleId` starts with `FND-`
 * and which carries `tags: ['pillar:<id>']`, where `<id>` is exactly one of
 * the seven pillar ids below. Findings are read defensively — `tags` is not
 * yet on the `Finding` interface in this worktree, so pillar membership is
 * resolved through a structural cast and anything without a recognised
 * pillar tag falls into a trailing "Other" group rather than being dropped.
 *
 * Pure and deterministic: fixed pillar order, items sorted by rule id, no
 * dates, no randomness. Returns `[]` when there is nothing foundation to
 * report so the caller can skip the section silently.
 */

export const FOUNDATION_PREFIX = 'FND-';
const PILLAR_TAG_PREFIX = 'pillar:';

export interface FoundationPillar {
  id: string;
  title: string;
  icon: string;
}

/** The seven foundation pillars, in stable presentation order. */
export const FOUNDATION_PILLARS: readonly FoundationPillar[] = [
  { id: 'docs', title: 'Docs', icon: '📚' },
  { id: 'governance', title: 'Governance', icon: '🏛️' },
  { id: 'ai-readiness', title: 'AI readiness', icon: '🤖' },
  { id: 'testing', title: 'Testing', icon: '🧪' },
  { id: 'environment', title: 'Environment', icon: '🌍' },
  { id: 'pipelines', title: 'Pipelines', icon: '🔁' },
  { id: 'standards', title: 'Standards', icon: '📏' },
];

const PILLAR_IDS = new Set(FOUNDATION_PILLARS.map((p) => p.id));

export type FoundationGrade = 'READY' | 'PARTIAL' | 'MISSING';

type TaggableFinding = Finding & { tags?: readonly string[] };

/** True for findings produced by the foundation (FND-*) rule pack. */
export function isFoundationFinding(f: Finding): boolean {
  return f.ruleId.startsWith(FOUNDATION_PREFIX);
}

/**
 * The pillar a foundation finding belongs to, from its `pillar:<id>` tag.
 * Returns `null` when the finding carries no recognised pillar tag — the
 * caller groups those under "Other" so nothing is silently dropped.
 */
export function pillarOf(f: Finding): string | null {
  const tags = (f as TaggableFinding).tags;
  if (!tags) return null;
  for (const t of tags) {
    if (t.startsWith(PILLAR_TAG_PREFIX)) {
      const id = t.slice(PILLAR_TAG_PREFIX.length);
      if (PILLAR_IDS.has(id)) return id;
    }
  }
  return null;
}

/** READY when everything applicable passes, MISSING when nothing does. */
export function gradePillar(passed: number, applicable: number): FoundationGrade {
  if (passed >= applicable) return 'READY';
  if (passed <= 0) return 'MISSING';
  return 'PARTIAL';
}

/** A finding counts toward readiness unless it is waived or inapplicable. */
function isApplicable(f: Finding): boolean {
  return !f.suppressedReason && f.status !== 'NOT_APPLICABLE';
}

const OPEN_TAG: Record<string, string> = {
  FAIL: '🔴',
  WRONG: '⚠️',
  MISSING: '🚫',
  UNKNOWN: '❓',
  DEPRECATED: '💀',
  EXPERIMENTAL: '🧪',
};

function byRuleId(a: Finding, b: Finding): number {
  return a.ruleId.localeCompare(b.ruleId, undefined, { numeric: true });
}

/**
 * Renders the "Foundation Readiness" markdown section as lines, one
 * subsection per pillar that has applicable FND findings. Per-pillar
 * readiness is shown as passed/applicable counts plus a READY / PARTIAL /
 * MISSING grade; open FND items are listed under their pillar. Empty input
 * (or input with no FND findings) yields `[]`.
 */
export function renderFoundationSection(findings: Finding[]): string[] {
  const fnd = findings.filter(isFoundationFinding).filter(isApplicable);
  if (fnd.length === 0) return [];

  const byPillar = new Map<string, Finding[]>();
  for (const f of fnd) {
    const key = pillarOf(f) ?? 'other';
    const list = byPillar.get(key) ?? [];
    list.push(f);
    byPillar.set(key, list);
  }

  const ordered = [
    ...FOUNDATION_PILLARS.filter((p) => byPillar.has(p.id)).map((p) => ({
      title: p.title,
      icon: p.icon,
      items: (byPillar.get(p.id) ?? []).sort(byRuleId),
    })),
    ...(byPillar.has('other')
      ? [{ title: 'Other', icon: '🧱', items: (byPillar.get('other') ?? []).sort(byRuleId) }]
      : []),
  ];

  const grades = ordered.map(({ items }) => {
    const passed = items.filter((f) => f.status === 'PASS').length;
    return gradePillar(passed, items.length);
  });
  const ready = grades.filter((g) => g === 'READY').length;

  const out: string[] = [];
  out.push('## 🏛️ Foundation Readiness');
  out.push('');
  out.push(
    'How ready the project foundations are — vision, intents, and per-pillar ' +
      'evidence from `.usa/foundation.yaml`. Grades: **READY** (every applicable ' +
      'check passing), **PARTIAL** (some open), **MISSING** (none passing).',
  );
  out.push('');
  out.push(
    `**Readiness: ${ready} of ${ordered.length} pillar${ordered.length === 1 ? '' : 's'} ready** · ` +
      ordered.map((g, i) => `${g.title} ${grades[i]}`).join(' · '),
  );
  out.push('');

  ordered.forEach(({ title, icon, items }, i) => {
    const passed = items.filter((f) => f.status === 'PASS').length;
    const open = items.filter((f) => f.status !== 'PASS');
    out.push(
      `### ${icon} ${title} — **${grades[i]}** · ${passed} passed / ${items.length} applicable`,
    );
    out.push('');
    if (open.length === 0) {
      out.push('No open findings in this pillar. ✅');
      out.push('');
      return;
    }
    for (const f of open) {
      const tag = OPEN_TAG[f.status] ?? '❓';
      out.push(`- ${tag} **${f.title}** \`${f.ruleId}\` — ${f.message}`);
      if (f.remediation) out.push(`  - 🛠️ ${f.remediation}`);
    }
    if (passed > 0) {
      out.push('');
      out.push(`<details><summary>${passed} check(s) passing in ${title}</summary>`);
      out.push('');
      for (const f of items.filter((f) => f.status === 'PASS')) {
        out.push(`- ✅ ${f.title} \`${f.ruleId}\``);
      }
      out.push('');
      out.push('</details>');
    }
    out.push('');
  });

  return out;
}
