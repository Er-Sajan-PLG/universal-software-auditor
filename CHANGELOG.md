# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.10.0](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.9.2...v2.10.0) (2026-09-14)


### Features

* **cli:** --dry-run preview on every writing command ([#79](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/79)) ([33c3abf](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/33c3abffa9240ce3b972410985fb97f2e41a31bc))

## [2.9.2](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.9.1...v2.9.2) (2026-09-14)


### Bug Fixes

* **release:** actually grant pull-requests scope for the bundle PR ([#75](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/75)) ([9ab32bd](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/9ab32bdb4e0c04749a4edb8e28a384ff85640e60))

## [2.9.1](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.9.0...v2.9.1) (2026-09-14)


### Bug Fixes

* **release:** grant pull-requests scope for the provenance bundle PR ([#72](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/72)) ([3b9780d](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/3b9780dda4e8571131fe9d89e80476517d9d81f7))

## [2.9.0](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.8.3...v2.9.0) (2026-09-14)


### Features

* **release:** attest tarball and file provenance bundle via PR ([#69](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/69)) ([d4c859d](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/d4c859dac198fc3f9bc51c495358f4d6b7ce4909))

## [2.8.3](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.8.2...v2.8.3) (2026-09-14)


### Bug Fixes

* **security:** contain store addresses, refuse path traversal (SEC-010) ([#64](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/64)) ([9db4e32](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/9db4e32f3b3cf1f72659830aa502122b9f52a63f))

## [2.8.2](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.8.1...v2.8.2) (2026-09-14)


### Bug Fixes

* **release:** scope the npmjs registry override, bare --registry loses to .npmrc ([#61](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/61)) ([fbe4e4a](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/fbe4e4aa8f72578560752febe5e4402a48925d87))

## [2.8.1](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.8.0...v2.8.1) (2026-09-14)


### Bug Fixes

* **release:** pin scope address in root .npmrc, npmjs leg explicit ([#59](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/59)) ([c1fe49f](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/c1fe49f9d003d630d3a1612afc84cdfa702711a7))

## [2.8.0](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.7.0...v2.8.0) (2026-09-14)


### Features

* **agent:** nemotron default with max reasoning; tracked_absent exclusions for safe templates ([4b10874](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/4b10874fd3e60dce1042ecbf11b11bf1d8e0268b))
* **agent:** nvidia preset, .env loading, subcommand help wins ([c6f94ec](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/c6f94ec2dafc916feca7eff7fd15fd595f9cd295))


### Bug Fixes

* **live:** vision-first interview, forgiving answers, clear triage, model check ([#58](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/58)) ([f487837](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/f487837ff5d8209ad14be4033e131b4b4127bac2))

## [2.7.0](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.6.0...v2.7.0) (2026-09-14)


### Features

* **report:** narrative renderer as a second format (ADR-0036) ([25947cb](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/25947cb11f163236e1cdb4791ae333b05d1ec773))

## [2.6.0](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.5.0...v2.6.0) (2026-09-13)


### Features

* **engine:** deterministic test-evidence analyzers ([da5cc79](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/da5cc79c24aba77de35cf0291e4d8ca09df28c8e))
* **live:** conversational audit sessions with stubbed LLM ([e0595ae](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/e0595ae798a9ec67e34b04f94e69929b9983194d))
* **phase:** live and evidence exports, ADRs 0034-0035, session docs ([2d7a3ea](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/2d7a3eafea22eaa3255b4f91738b05ca5b612ff3))


### Bug Fixes

* **cli:** fully static provider-unavailable message ([b6d96ba](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/b6d96ba20e231dcf140c9d5e51bbe498ea81e271))
* **cli:** never paraphrase provider errors into logs (secret hygiene) ([a3e495a](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/a3e495a15d07f1455d807f0e0184946090815585))
* **cli:** static async rejection message at entrypoint ([756caa4](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/756caa439f76b3add2e5015e8e5b46fcca290825))

## [2.5.0](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.4.0...v2.5.0) (2026-09-13)


### Features

* **agent:** openAI-compatible LLM provider layer ([9547c8f](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/9547c8f587b28c88e15c597d203a30a8308fb052))
* **categories:** future-ready assurance taxonomy with derived coverage ([8ac21af](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/8ac21af72c6f7377737a34229b1b16db7f634234))
* **phase:** categories CLI, agent exports, provider refactor, vision, ADRs 0030-0033 ([c2d1d4d](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/c2d1d4d04a064d537f5f29a43f12b9c1b388b96d))
* **rules:** register testing-assurance pack and sync generated docs ([2b5b5f0](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/2b5b5f0d56f990c30b7d4dd8e73e8ae3d7624117))
* **rules:** testing assurance checks (TAS-001+) ([6186257](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/61862573f994e06f6dec31d171dfbdd9bc8cab4f))


### Bug Fixes

* **agent:** strip trailing slashes without regex (ReDoS surface) ([d36da07](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/d36da073d1c1042ab2ed7e7038b3a5dfa25326b2))

## [2.4.0](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.3.4...v2.4.0) (2026-09-13)


### Features

* **foundation:** intent file loader and interview CLI ([79e5a30](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/79e5a308f23ccf84a173e7692a752279d20becb9))
* **foundation:** intent wiring, tags plumbing, registration, sync, ADR-0029 ([59b7376](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/59b73769ffbe17fdb9fb7d6522acc422362f3f16))
* **report:** foundation readiness section and docs ([16bc2d0](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/16bc2d007be73a92f8a47f8282ecb8a3db7f5a2b))
* **rules:** foundation readiness checks (FND-001+) ([00221b2](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/00221b2fa86f5971e7e4cf30302a091aef435a5d))

## [2.3.4](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.3.3...v2.3.4) (2026-09-13)


### Bug Fixes

* **ci:** publish GPR mirror with public access ([#44](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/44)) ([dc44d21](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/dc44d21c77d4dcf89d5b13ab3106e41c73d8feca))

## [2.3.3](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.3.2...v2.3.3) (2026-09-13)


### Bug Fixes

* **ci:** authenticate GPR mirror with scope-owner PAT ([#42](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/42)) ([d634913](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/d6349131aafe0b928e3650d6ba2387400f64bec0))

## [2.3.2](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.3.1...v2.3.2) (2026-09-13)


### Bug Fixes

* **ci:** publish GPR mirror under owner scope ([#40](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/40)) ([e9ff8b3](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/e9ff8b3400479722068b640944d2b395235ab888))

## [2.3.1](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.3.0...v2.3.1) (2026-09-13)


### Bug Fixes

* **detect:** recognise git worktree gitdir pointers as repos ([#38](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/38)) ([bee82f2](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/bee82f28cef8256cfa1300e241685557c6b9cee8))

## [2.3.0](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.2.0...v2.3.0) (2026-09-13)


### Features

* **cli:** verify-report command for detached report signatures ([de0792d](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/de0792d2a509611f1e8feffc2ab2f636ab3b7007))
* **rules:** attestation and VSA presence checks (SUP-022+) ([b745ee6](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/b745ee6335ed685afd42fffcef5119b05f8de18b))
* **rules:** cosign chain-verification provenance checks (SUP-018+) ([c864d00](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/c864d009992c82af77a1582c6039c9153047adc6))
* **rules:** register provenance packs, sync generated docs, record ADRs 0024-0027 ([9d24aae](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/9d24aae6c1430945f0d4edbe26435bbd6347f59d))

## [2.2.0](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.1.0...v2.2.0) (2026-09-13)


### Features

* **gate:** quality gate on newly-introduced and regressed findings ([07bea0a](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/07bea0ac6ff3bd8530f377ebaf1250d8dbb6208e))
* **report:** verify-side support for detached report signatures ([6fe124b](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/6fe124b2a01558c78ab0f3e7306c5487148f4c80))
* triaged judgement queue, dated reviews, generated-docs resync ([#32](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/32)) ([8bc704d](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/8bc704dcf06062efd9d31aaa753e3cd6ada4cba5))


### Bug Fixes

* **lint:** split baseline gate helpers to satisfy complexity and error-cause rules ([a7fd8fc](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/a7fd8fcb48eb39ffabdfef861bdc7874316e1283))

## [2.1.0](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.0.1...v2.1.0) (2026-09-13)


### Features

* **docs:** enforce no unmarked claims, add writing guide and scheduled checks ([8031ed6](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/8031ed6b650a1db2808e2b420ab94f945d455524))
* **docs:** machine-synced, machine-checked documentation (ADR-0020) ([97f1c9d](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/97f1c9db3a62f24047a2dcc19c984db31a3b6488))
* **engine:** add oracle check kind to ingest external scanner evidence ([1bf4f0a](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/1bf4f0a3821080d363869737af2e692b72400d25))
* **report:** add JSON and SARIF renderers ([95fafef](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/95fafeffb62bc9f5ceb4b078de177fcef25aeaef))
* **standards:** pin catalogues and derive automatability (ADR-0021) ([18a26d7](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/18a26d7890cc87f2ea8a4501a11f1a28d28aadd9))
* **suppressions:** site-level waivers + unused reporting (ADR-0022) ([88bf6ae](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/88bf6ae5b3a89fdc74d928f7bb8c0fab188d7e37))


### Bug Fixes

* legacy maturity focus and shipped template asset ([f88b5de](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/f88b5de553335841f2b56ea71bb0b11409877910))

## [2.0.1](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v2.0.0...v2.0.1) (2026-09-12)


### Bug Fixes

* **cli:** run installed bin through npm symlink ([ae8cd53](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/ae8cd53880c6f57bb070316280ba359556e0ade0))
* **release:** cut 2.0.1 for the shipped CLI entry-point fix ([80884a4](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/80884a4edb6f98bca67685cfab8da28fd334f825))

## [2.0.0](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v1.3.0...v2.0.0) (2026-09-12)


### ⚠ BREAKING CHANGES

* rename project to Universal Software Auditor (USA)

### Features

* capability registry, benchmark fleet, release gate, evolution loop ([9df8da5](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/9df8da598d4e7227aae29970d7603109ed9a5592))
* coverage model + capability gaps + run-time pack injection ([c4f2a1a](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/c4f2a1a323f5faa09d860a83655367c4de7d8a4d))
* **evolution:** deterministic proposal stage + evidence-required release ([8312b30](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/8312b30920beb356a0169b9f135c457d42373732))
* **evolution:** persistent gap queue + learn-from-report ([e041070](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/e041070947c2aaacc1a07c30b8ca8e67b8310354))
* **evolution:** queue-driven scheduler (usa evolve --all-gaps) ([1c09b91](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/1c09b9147778957ff4bcddeae0b9962272c317e9))
* immutable snapshots + content-addressed store ([87c8085](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/87c8085e47bbbe4cbd9722d0cc2c4a86402f42d6))
* **swift:** add detectors and rules for Validatable and security headers ([394d9db](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/394d9db671c399133d9608e7bce2fe1e7aef77ea))
* usa evolve CLI + docs + ADR-0013 ([6d84b1b](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/6d84b1b78a4e65f4622207fb508f58efedea28fc))


### Bug Fixes

* **ci:** full history for test job; modernize husky hooks ([285069a](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/285069ac9286406292d1b4d2555ad8a549335312))
* **repo:** correct release manifest, package files, and experiment artifacts ([3913824](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/39138241564c456acf8ba8d642630ddf86ddabb1))
* **swift:** simplify validation detection patterns to avoid escape-drift ([40c22f5](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/40c22f536d461f51a90fbdc2ad2e917b839ef558))


### Code Refactoring

* rename project to Universal Software Auditor (USA) ([bd5d6a7](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/bd5d6a739902833f31998c38b728cac7d684da11))

## [1.3.1](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v1.3.0...v1.3.1) (2026-09-12)


### Changed

* **BREAKING:** renamed the project and package from `@xenos1996/usat`
  (USAT, Software Auditing Template) to `@xenos1996/usa` (Universal Software
  Auditor); the CLI binary is now `usa`. This supersedes the `usat` 1.3.0 line.
* Added the deterministic evolution loop (snapshot, coverage, gaps,
  proposal, benchmark, release gate), the persistent gap queue, and the
  queue-driven scheduler (`usa evolve --all-gaps`). See ADR-0013..0016.


## [1.1.0](https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v1.0.0...v1.1.0) (2026-09-09)


### Features

* **release:** developer-style versioning via release-please + commitlint ([#16](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/16)) ([6dc28e3](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/6dc28e3a49c92f2da39fb17755c77ab72f4ca6fd))


### Bug Fixes

* Node 24 + npm floor for OIDC trusted publishing ([#15](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/15)) ([73f321d](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/73f321d4302eec13e7187ceb58dd5d56922b5a89))
* pin scorecard-action to v2.4.4 (no v2 major tag exists) ([#17](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/17)) ([9967ddf](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/9967ddf564d4883426961091fe8170bf85578ac0))
* unblock releases — SUP-008 self-finding, CHANGELOG prettierignore, TEST-005 pattern ([#19](https://github.com/Er-Sajan-PLG/universal-software-auditor/issues/19)) ([9304f0a](https://github.com/Er-Sajan-PLG/universal-software-auditor/commit/9304f0a32e465507e526ca6adc44a157246b7f9a))

## [Unreleased]

## [1.0.0] — 2026-09-08

The first full release. Previously this repository was a scaffold: a README, a
CONTRIBUTING guide, a CI stub, and two empty `Auditor` classes in Python and
TypeScript. Everything below is new.

### Added

**The engine**

- A deterministic audit engine in TypeScript (`src/`), published as the `usa` CLI:
  `audit` · `detect` · `rules` · `explain` · `diff` · `init`.
- Dependency-free glob matching, a project index that respects `.gitignore`, and
  git-aware checks (`tracked_present` / `tracked_absent`) so committed build output and
  committed `.env` files are detectable.
- Zero runtime dependencies except `yaml`. No network access at audit time; USA never
  uploads anything.

**Detection**

- ~200 declarative signals in `rules/detectors.yaml` covering 20 languages, 20 package
  managers, 40+ frameworks, 10 databases, 11 ORMs, auth mechanisms, CI providers,
  observability, and the AI/LLM stack.
- Prose, tests, and examples are excluded from content scans, so a README that mentions
  Postgres no longer makes a project look like it uses Postgres.
- Lifecycle classification (prototype → legacy) from tests, CI, changelog, tags,
  history, and commit recency, with every signal printed in the report.

**Rules**

- 27 rule packs, ~220 rules, across 16 sections:
  - `core/` — 11 universal packs (repo, security, supply chain, architecture,
    code quality, testing, CI/CD, release, dependencies, documentation,
    future readiness)
  - `stacks/` — 16 conditional packs (node-typescript, python, go, rust, jvm,
    web-frontend, mobile, containers, iac, solidity, ml-ai, cli, data, api-backend,
    compliance, ai-era)
- 15 check kinds: `file_exists`, `file_absent`, `any_file`, `grep_present`,
  `grep_absent`, `grep_wrong`, `grep_deprecated`, `tracked_present`,
  `tracked_absent`, `count_min`, `file_lines_max`, `json_path`, `command`, `manual`,
  `info`.

**Sections new in USA**

- **S3 Supply Chain & Build Provenance** — promoted from four bullets under dependency
  security. SLSA v1.2 provenance, workflow script injection, token permissions, action
  pinning, SBOM, image signing.
- **S9 Release & Change Management** — SemVer, tags, release notes, migration ordering,
  feature flags, runbooks.
- **S14 AI / LLM-Era Risks** — mapped to OWASP Top 10 for LLM Applications (2026) and
  OWASP Top 10 for Agentic AI (ASI, 2026). Prompt injection, excessive agency,
  unbounded consumption, RAG tenant leakage, memory poisoning, and `AGENTS.md` as
  executable-ish instruction.

**Modelling**

- **Severity × status** split: severity is a property of the rule, status a property of
  the observation. This is what makes scoring reproducible instead of vibes.
- **⚠️ WRONG as a distinct status** (credit 0.15) — present-but-incorrect is worse than
  absent, because it looks finished.
- **Maturity-aware severity dampening** across five lifecycle profiles, with a hard
  floor: 🔴 CRITICAL is never dampened, at any stage.
- **Confidence** reported next to every score; sections with nothing verifiable say
  _"— not verified"_ rather than quietly scoring 10/10.
- **Approved-risk suppressions** — excluded from the score, still listed in the report,
  and always require a reason.
- **`usa diff`** — every report embeds a machine-readable YAML trailer, so consecutive
  audits produce fixed / regressed / newly-applicable lists and a net movement.

**Integrations**

- `action.yml` composite action; `usa init` scaffolds `.usa.yaml` and a workflow.
- Agent Skills pack (`skills/usa-audit/SKILL.md`) following the `SKILL.md` convention,
  with `references/`.
- `templates/AGENTS.audit.md` — drop into any repository to make it agent-auditable.
- Public TypeScript API (`src/index.ts`).

**Docs**

- `USA.md` — the full template: 16 sections, severity model, maturity profiles,
  scoring, agent behaviour rules, and the report template.
- `docs/` — getting started, concepts, configuration, rule-pack authoring, detectors,
  maturity profiles, agent integration, CI integration, and a standards mapping
  comparing USA to ASVS 5.0, NIST SSDF, SLSA v1.2, OpenSSF Scorecard, ISO/IEC 5055,
  WCAG 2.2, EU CRA, and the OWASP LLM/ASI Top 10 (2026).

**Operations**

- This repository audits itself on every PR (`.github/workflows/self-audit.yml`).

### Changed

- **Consolidated on TypeScript.** The Python scaffold (`src/auditor.py`,
  `pyproject.toml`) was removed — it was an empty stub, and maintaining two parallel
  engines for a template is a liability. The rule packs are pure YAML, so a Python
  implementation remains possible without a rewrite of the rules.

[Unreleased]: https://github.com/Er-Sajan-PLG/universal-software-auditor/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Er-Sajan-PLG/universal-software-auditor/releases/tag/v1.0.0
