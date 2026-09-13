/**
 * USA — Universal Software Auditor
 * Programmatic API. Everything the CLI does is available here.
 */

export { Project } from './util/project.js';
export { detect, loadDetectors, classifyMaturity, loadDetectorFile } from './detect/index.js';
export {
  loadRulePacks,
  loadPackFile,
  parsePackText,
  applyRuleOverrides,
  validatePredicate,
  DEFAULT_WEIGHT,
  SEVERITY_LADDER,
} from './engine/loader.js';
export { loadSections, DEFAULT_SECTIONS } from './engine/sections.js';
export { loadProfiles, dampen } from './engine/maturity.js';
export { runAudit } from './engine/audit.js';
export { score } from './engine/score.js';
export { evaluateRule, evalPredicate, ruleApplies, packApplies } from './engine/evaluate.js';
export {
  buildSuppressionIndex,
  applySuppressions,
  unusedSuppressions,
  describeSuppression,
  isSuppressed,
  type SuppressionIndex,
  type SuppressionEntry,
  type SuppressionOutcome,
} from './engine/suppression.js';
export {
  automatabilityOf,
  ruleAutomatability,
  parseCatalogue,
  validateCatalogue,
  validateAutomatability,
} from './engine/automatability.js';
export {
  buildReviewIndex,
  attachReviews,
  resolveActiveReviews,
  unusedReviews,
  describeReview,
  reviewAgeDays,
  reviewOverdueDays,
  isReviewStale,
  type ReviewIndex,
  type ReviewEntry,
} from './engine/review.js';
export {
  loadCatalogues,
  catalogueOf,
  catalogueCoverage,
  type Catalogue,
  type CatalogueCoverage,
} from './engine/catalogues.js';
export {
  loadCategories,
  categoryCoverage,
  type CategoryDef,
  type CategoryCoverage,
  type CategoryId,
} from './engine/categories.js';
export { complete, listModels, loadProviderConfig, PROVIDER_PRESETS } from './agent/providers.js';
export type {
  ChatMessage,
  ChatRequest,
  ChatResult,
  ProviderPreset,
  ProviderOverrides,
  ResolvedConfig,
  ModelInfo,
} from './agent/types.js';
export { renderMarkdown, parseTrailer, trailer } from './report/markdown.js';
export {
  renderJson,
  toJsonReport,
  JSON_SCHEMA,
  type JsonReport,
  type JsonFinding,
} from './report/json.js';
export { renderSarif, toSarif, SARIF_VERSION, type SarifLog } from './report/sarif.js';
export { diffReports } from './engine/diff.js';
export { evaluateGate, blockingFindings } from './engine/gate.js';
export { loadConfig, EXAMPLE_CONFIG, CONFIG_FILE } from './config.js';

// Evolution layer: the deterministic audit → gap → candidate → benchmark →
// release → re-audit loop.
export {
  snapshotOfProject,
  snapshotOfDir,
  identityFromFiles,
  canonicalJson,
  hashText,
} from './snapshot/index.js';
export { Store } from './store/index.js';
export { computeCoverage } from './evolution/coverage.js';
export { deriveGaps } from './evolution/gap.js';
export { resolveCapabilitySetId, capabilityFromPack, basePackIds } from './evolution/capability.js';
export { runBenchmark } from './evolution/benchmark.js';
export { evaluateRelease, DEFAULT_RELEASE_GATE } from './evolution/release.js';
export {
  proposeCandidate,
  proposeCandidates,
  proposeFromSuggestions,
} from './evolution/propose.js';
export { GapQueue } from './evolution/queue.js';
export { scheduleCandidates } from './evolution/schedule.js';
export { runEvolutionCycle } from './evolution/run.js';

export type * from './types.js';
export type * from './snapshot/index.js';
export type * from './evolution/types.js';
export type { SectionDef } from './engine/sections.js';
export type { MaturityProfile } from './engine/maturity.js';
export type { AuditOutcome, AuditOptions } from './engine/audit.js';
export type { ScoredRule } from './engine/score.js';
export type { EvalContext } from './engine/evaluate.js';
