import type { Finding, FindingReview, Location, Review } from '../types.js';
import { matchesSite, siteMatcher } from '../util/site.js';

const DAY_MS = 86_400_000;

/**
 * Recorded human reviews (ADR-0023).
 *
 * A review is provenance, not a verdict: it attaches a date (and an optional
 * re-review deadline) to an open finding without changing the engine's status.
 * A review is "used" when it matched a finding; one that matched nothing is
 * reported, so the ledger decays instead of accumulating — the ESLint
 * unused-directive model, applied to attention rather than excusal.
 */
export interface ReviewEntry {
  readonly review: Review;
  readonly matcher: RegExp | null;
  used: boolean;
}

/** Active reviews, grouped by rule id. */
export type ReviewIndex = Map<string, ReviewEntry[]>;

/** Build the index from validated reviews (see `resolveActiveReviews`). */
export function buildReviewIndex(reviews: Review[] | undefined): ReviewIndex {
  const index: ReviewIndex = new Map();
  for (const r of reviews ?? []) {
    if (!r.rule) continue;
    const entry: ReviewEntry = { review: r, matcher: siteMatcher(r.file), used: false };
    const list = index.get(r.rule);
    if (list) list.push(entry);
    else index.set(r.rule, [entry]);
  }
  return index;
}

/**
 * Attach the first matching review to each open finding and mark the entry used.
 *
 * A rule-wide review (no `file`) vouches for the finding whatever its locations;
 * a site-scoped one matches only when a location falls inside the site, so it can
 * never vouch for the whole rule. PASS, SKIPPED, and already-suppressed findings
 * are not reviewed — a suppression already recorded the decision (ADR-0007).
 */
export function attachReviews(index: ReviewIndex, findings: Finding[]): void {
  for (const finding of findings) {
    if (!isReviewable(finding)) continue;
    const entries = index.get(finding.ruleId);
    if (!entries || entries.length === 0) continue;
    const entry = entries.find((e) => entryMatches(e, finding.locations));
    if (!entry) continue;
    entry.used = true;
    finding.review = toFindingReview(entry.review);
  }
}

function isReviewable(f: Finding): boolean {
  if (f.suppressedReason) return false;
  return f.status !== 'PASS' && f.status !== 'NOT_APPLICABLE';
}

function entryMatches(entry: ReviewEntry, locations: Location[]): boolean {
  const r = entry.review;
  if (!r.file) return true;
  return locations.some((loc) => matchesSite(entry.matcher, r.line, loc));
}

function toFindingReview(r: Review): FindingReview {
  const out: FindingReview = { reviewed: r.reviewed };
  if (r.until !== undefined) out.until = r.until;
  if (r.by !== undefined) out.by = r.by;
  if (r.note !== undefined) out.note = r.note;
  return out;
}

/**
 * Validate and keep the reviews the audit can honour. A review with no rule, or
 * with a `reviewed`/`until` date that cannot be parsed, is dropped with a warning
 * rather than trusted: a deadline we cannot read must not look like freshness
 * (fail closed, ADR-0009). Mirrors suppression expiry (ADR-0007).
 */
export function resolveActiveReviews(reviews: Review[] | undefined, warnings: string[]): Review[] {
  const active: Review[] = [];
  for (const r of reviews ?? []) {
    if (!r.rule) {
      warnings.push('review entry is missing "rule" — ignored');
      continue;
    }
    if (!isValidDate(r.reviewed)) {
      warnings.push(
        `review for ${describeReview(r)} has an unparseable "reviewed" date ("${r.reviewed}") — review ignored`,
      );
      continue;
    }
    if (r.until !== undefined && !isValidDate(r.until)) {
      warnings.push(
        `review for ${describeReview(r)} has an unparseable "until" date ("${r.until}") — review ignored`,
      );
      continue;
    }
    active.push(r);
  }
  return active;
}

function isValidDate(value: string): boolean {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value));
}

/** Every entry across the index that matched no finding this run. */
export function unusedReviews(index: ReviewIndex): Review[] {
  const out: Review[] = [];
  for (const entries of index.values()) {
    for (const e of entries) if (!e.used) out.push(e.review);
  }
  return out;
}

/** Whole days since the review — the age shown next to an open item. */
export function reviewAgeDays(review: FindingReview, atMs: number): number | null {
  const t = Date.parse(review.reviewed);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((atMs - t) / DAY_MS));
}

/** Whole days a review's deadline is in the past, or null when it is not due. */
export function reviewOverdueDays(review: FindingReview, atMs: number): number | null {
  if (!review.until) return null;
  const t = Date.parse(review.until);
  if (Number.isNaN(t) || atMs <= t) return null;
  return Math.floor((atMs - t) / DAY_MS);
}

/** True when a review carries a deadline that has passed. */
export function isReviewStale(review: FindingReview, atMs: number): boolean {
  return reviewOverdueDays(review, atMs) !== null;
}

/**
 * A stable, human-readable label for a review: `RULE` for a rule-wide review,
 * `RULE (file[:line])` for a site-scoped one. Used in warnings.
 */
export function describeReview(r: Review): string {
  if (!r.file) return r.rule;
  return r.line === undefined ? `${r.rule} (${r.file})` : `${r.rule} (${r.file}:${r.line})`;
}
