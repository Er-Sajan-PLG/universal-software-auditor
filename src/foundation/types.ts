/**
 * Foundation intent schema — the interview half of Foundation Readiness.
 *
 * This module is deterministic only: plain types, option vocabularies, and a
 * defaults factory. No I/O, no LLM, no scoring. The coordinator (not this
 * package) wires `loadFoundationFacts` output into audit facts; a broken
 * intent file must therefore fail loudly at the parse boundary rather than
 * silently auditing against half an intent.
 */

/** The only foundation schema version this worker reads and writes. */
export const FOUNDATION_VERSION = 1 as const;

/** Project-relative path of the intent file, e.g. `<root>/.usa/foundation.yaml`. */
export const FOUNDATION_DIR = '.usa';
export const FOUNDATION_BASENAME = 'foundation.yaml';

/** Intents the interview multi-select offers. Fact flags are `intent:<value>`. */
export const INTENT_OPTIONS = [
  'api',
  'cli',
  'library',
  'service',
  'frontend',
  'docs-site',
  'data-pipeline',
  'mobile',
] as const;

export type FoundationIntentOption = (typeof INTENT_OPTIONS)[number];

/** Stage targets the interview offers. Mirrors the audit maturity scale. */
export const STAGE_OPTIONS = ['prototype', 'mvp', 'beta', 'production', 'legacy'] as const;

export type FoundationStageOption = (typeof STAGE_OPTIONS)[number];

export interface FoundationProject {
  name: string;
  vision: string;
  intents: string[];
}

export interface FoundationDocsPillar {
  required: string[];
}

export interface FoundationGovernancePillar {
  codeOfConduct: boolean;
  contributing: boolean;
  securityPolicy: boolean;
  license: boolean;
}

export interface FoundationAiPillar {
  readable: boolean;
  writable: boolean;
}

export interface FoundationTestingPillar {
  dirs: string[];
  minCoverage?: number;
}

export interface FoundationEnvironmentPillar {
  files: string[];
}

export interface FoundationPipelinesPillar {
  ci: string[];
  local: string[];
}

export interface FoundationPillars {
  docs: FoundationDocsPillar;
  governance: FoundationGovernancePillar;
  ai: FoundationAiPillar;
  testing: FoundationTestingPillar;
  environment: FoundationEnvironmentPillar;
  pipelines: FoundationPipelinesPillar;
  standards: string[];
  specs: string[];
}

export interface FoundationConfig {
  version: typeof FOUNDATION_VERSION;
  project: FoundationProject;
  /** Stage the project is aiming at; one of STAGE_OPTIONS. */
  stage?: string;
  pillars: FoundationPillars;
}

/**
 * The defaults file `--non-interactive` writes (and the interview starts
 * from): stack-sensible, CI-safe, deliberately boring. Every value survives a
 * `render → parse` round-trip.
 */
export function defaultFoundation(projectName: string): FoundationConfig {
  return {
    version: FOUNDATION_VERSION,
    project: { name: projectName, vision: '', intents: ['library'] },
    stage: 'prototype',
    pillars: {
      docs: { required: ['README.md'] },
      governance: {
        codeOfConduct: true,
        contributing: true,
        securityPolicy: true,
        license: true,
      },
      ai: { readable: true, writable: false },
      testing: { dirs: ['tests'], minCoverage: 80 },
      environment: { files: ['.env.example'] },
      pipelines: { ci: ['.github/workflows/ci.yml'], local: ['test', 'build'] },
      standards: [],
      specs: [],
    },
  };
}
