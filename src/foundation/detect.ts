import { Project } from '../util/project.js';
import { defaultFoundation, type FoundationConfig } from './types.js';

/**
 * Detected defaults for the foundation interview (ADR-0029, vision-first
 * revision): everything the repo already says about itself, so the human is
 * only ever asked what no tool can observe — vision, intents, stage target.
 * File lists name observed files only (absence is never upgraded into a
 * promise); conventional names (default scripts, CI path, coverage bar) and
 * the promise fields (vision, intents, stage, standards) keep shipped
 * defaults.
 */

const DOC_CANDIDATES = [
  'README.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'SECURITY.md',
  'docs/ARCHITECTURE.md',
  'CHANGELOG.md',
];

const GOVERNANCE_FILES = {
  codeOfConduct: 'CODE_OF_CONDUCT.md',
  contributing: 'CONTRIBUTING.md',
  securityPolicy: 'SECURITY.md',
  license: 'LICENSE',
} as const;

const AGENT_FILES = ['AGENTS.md', 'llms.txt', 'CLAUDE.md', 'MUSE.md', '.cursorrules'];

const TEST_DIRS = ['tests', 'test', '__tests__', 'spec', 'e2e'];

const ENV_FILES = [
  '.env.example',
  'Dockerfile',
  'compose.yml',
  'compose.yaml',
  'docker-compose.yml',
  '.nvmrc',
  '.node-version',
];

const CI_FILES = [
  '.github/workflows/ci.yml',
  '.github/workflows/ci.yaml',
  '.gitlab-ci.yml',
  'Jenkinsfile',
  '.circleci/config.yml',
];

const SPEC_FILES = [
  'openapi.yaml',
  'openapi.yml',
  'openapi.json',
  'SPEC.md',
  'docs/spec.md',
  'api/openapi.yaml',
];

/** Files from `candidates` that exist in the tree, in candidate order. */
function existing(project: Project, candidates: string[]): string[] {
  return candidates.filter((f) => project.has(f));
}

/** Subdirectories of root that exist (test dirs, etc.). */
function existingDirs(project: Project, candidates: string[]): string[] {
  return candidates.filter((d) => project.dirExists(d));
}

/** CI workflow files that actually exist (globbed, capped for sanity). */
function existingWorkflows(project: Project): string[] {
  const found = project.glob(['.github/workflows/*.yml', '.github/workflows/*.yaml']);
  const rest = CI_FILES.filter((f) => !f.startsWith('.github/') && project.has(f));
  return [...found, ...rest].slice(0, 6);
}

/** `package.json` script names, or [] when absent/unreadable. */
function packageScripts(project: Project): string[] {
  const pkg = project.readJson('package.json') as { scripts?: unknown } | null;
  if (!pkg || typeof pkg.scripts !== 'object' || pkg.scripts === null) return [];
  return Object.keys(pkg.scripts as Record<string, unknown>).slice(0, 10);
}

/**
 * Foundation defaults with the repo's own evidence filled in. Vision,
 * intents, stage target, coverage bar, and standards stay exactly as
 * `defaultFoundation` ships them — those are promises, not observations.
 */
export function detectFoundationDefaults(root: string, projectName: string): FoundationConfig {
  const project = new Project(root);
  const config = defaultFoundation(projectName);
  config.pillars.docs.required = existing(project, DOC_CANDIDATES);
  config.pillars.governance = {
    codeOfConduct: project.has(GOVERNANCE_FILES.codeOfConduct),
    contributing: project.has(GOVERNANCE_FILES.contributing),
    securityPolicy: project.has(GOVERNANCE_FILES.securityPolicy),
    license: project.has(GOVERNANCE_FILES.license),
  };
  config.pillars.ai = {
    readable: AGENT_FILES.some((f) => project.has(f)),
    writable: false,
  };
  config.pillars.testing.dirs = existingDirs(project, TEST_DIRS);
  config.pillars.environment.files = existing(project, ENV_FILES);
  const scripts = packageScripts(project);
  if (scripts.length > 0) config.pillars.pipelines.local = scripts;
  const ci = existingWorkflows(project);
  if (ci.length > 0) config.pillars.pipelines.ci = ci;
  config.pillars.specs = existing(project, SPEC_FILES);
  return config;
}
