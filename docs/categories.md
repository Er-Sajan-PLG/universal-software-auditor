# Assurance categories

USA scores sixteen report sections (S1–S16). Categories are a second,
future-ready axis over the same rules: ten stable themes that answer "what
kind of assurance is this?" instead of "where does it score?". They change
nothing about scoring, gating, or the report — they are a derived view, the
same derivation precedent that keeps catalogue mapping honest.

## The taxonomy

| Category                                                  | Label       | Draws on                       |
| --------------------------------------------------------- | ----------- | ------------------------------ |
| [Foundational](#foundational)                             | IMPLEMENTED | S1, S3 · REPO-, FND-           |
| [Security](#security)                                     | IMPLEMENTED | S2, S3, S10 · SEC-, SUP-, DEP- |
| [Networking](#networking)                                 | PROPOSED    | — (no rules yet)               |
| [Communication](#communication)                           | PROPOSED    | — (no rules yet)               |
| [User experience](#user-experience)                       | PROPOSED    | — (no rules yet)               |
| [Vision](#vision)                                         | PROPOSED    | — (no rules yet)               |
| [Technical state of the art](#technical-state-of-the-art) | IMPLEMENTED | S14, S15, S16 · AI-, ML-, FUT- |
| [Architecture](#architecture)                             | IMPLEMENTED | S4 · ARCH-                     |
| [Standards](#standards)                                   | IMPLEMENTED | S13 · COMP-                    |
| [Protocol](#protocol)                                     | PROPOSED    | — (no rules yet)               |

Every description in `rules/categories.yaml` states its label up front.
IMPLEMENTED means real rules are mapped; PROPOSED means aspirational and
empty. An empty category is a valid, labeled state — the registry is never
padded with unrelated rules to fake coverage.

## Mapping rationale per category

### Foundational

Repository structure and foundation readiness. REPO- checks prove the
project is detectable (manifest, version control, layout); FND- checks prove
intent is stated before the audit judges anything. Everything deeper depends
on this ground holding, so it is its own axis rather than a preamble.

### Security

Application controls (SEC-), supply-chain integrity and provenance (SUP-),
and dependency risk (DEP-). These are grouped because they share a threat
model — untrusted input, tampered artifacts, known-vulnerable components —
and because they carry the heaviest scoring weights: one failure here
outweighs tidy docs elsewhere.

### Networking

PROPOSED. Reserved for transport security, DNS hygiene, ingress/egress
policy, and service connectivity. Most breaches cross a network boundary,
but the rule tree has no dedicated networking checks today, so this axis
stays empty until such packs land. Left empty on purpose; API- rules live in
the platform section and are not claimed here.

### Communication

PROPOSED. Reserved for messaging, eventing, notification, and coordination
surfaces — queues, webhooks, changelogs, incident channels. Silent systems
fail silently, but no communication packs exist yet.

### User experience

PROPOSED. Reserved for interaction quality and user-facing clarity beyond
static compliance text. Compliance packs check that accessibility statements
exist; UX will check that the product is actually usable. That distinction
is why S13 is not borrowed here.

### Vision

PROPOSED. Reserved for the live-assurance future: continuous verification,
runtime attestation, and audit loops that outgrow point-in-time reports.
This axis exists so the taxonomy already has a home for that work when it
arrives — it must not be read as claiming the capability now.

### Technical state of the art

AI-era risk controls (AI-), machine-learning stack hygiene (ML-), and
future-readiness signals (FUT-). New failure modes — prompt injection,
model provenance, framework churn — appear here first, so the audit tracks
the frontier in one place instead of scattering it across stacks.

### Architecture

System structure and design intent (ARCH-). Kept narrow deliberately:
architecture is the S4 judgement about modularity and drift, not a bucket
for everything structural. Release and CI rules score elsewhere and are not
claimed here.

### Standards

Compliance posture and external-framework alignment (COMP-). These findings
have counterparties — regulators, customers, auditors — so conformance
evidence is grouped independently of engineering taste.

### Protocol

PROPOSED. Reserved for wire-protocol conformance, API contract fidelity,
and schema compatibility. Integrations fail at boundaries, but no
protocol-conformance packs exist yet.

## How coverage is derived

`categoryCoverage(packs, categories)` in `src/engine/categories.ts` tallies
loaded rules per category: a rule belongs to every category whose
`rulePrefixes` match the start of its id (`SEC-001` matches `SEC-`). The
result is `{ id, name, ruleCount, sections[] }` — counts only, never a
scoring input. `loadCategories(rulesDir)` reads the registry fail-closed:
a missing file, invalid YAML, or wrong schema yields a warning and no
categories; an entry missing its id or honesty label, using an unknown id,
or duplicating one is skipped with a warning.

## How to extend

The category set is frozen at these ten ids — proposing an eleventh is a
taxonomy change, argued as an ADR, not a patch. What grows is the mapping
inside a category:

1. Ship the rule pack first, with its own section and rule-id prefix.
2. Add the prefix (and any section drawn on) to the category entry in
   `rules/categories.yaml`.
3. Flip a PROPOSED description to IMPLEMENTED once real rules are mapped —
   never before.
4. Run the category tests; mapping integrity is enforced there, not just
   by convention.
