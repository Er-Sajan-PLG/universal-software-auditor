# 33. Future categories are derived, some are honestly empty

- **Date:** 2026-09-13
- **Status:** Accepted

## Context

The vision points past auditing into domains USA barely covers today:
networking, communication, UX, vision-drift, protocol — alongside the five it
does (foundational, security, technical-sota, architecture, standards). The
naive design is a second rule system: new sections, new severities, a
parallel taxonomy that redescribes the first. That duplicates the framework
to describe ambition, and every future rule would need filing in two places.

## Decision

**`rules/categories.yaml` maps ten future domains onto the existing
sections/rules; `categoryCoverage` derives counts; emptiness is labeled.**

- Each category carries sections[] and rulePrefixes[] into the current tree.
  Five resolve to real coverage (foundational 32, security 56,
  technical-sota 27, architecture 10, standards 10); five resolve to zero
  (networking, communication, ux, vision, protocol) and say so in their
  descriptions — aspirational-but-empty is a valid labeled state, padding the
  mapping to fake coverage is refused (same rule as ADR-0021's uncatalogued
  bucket).
- Coverage is derived and read-only: counts only, no scoring/gate/confidence
  input. `usa categories` reports it (md/json like `usa standards`).
- The registry is validated fail-closed (malformed → warning + skip), and a
  test encodes the core contract: every sections[] entry exists, every
  rulePrefixes[] matches a real rule OR the category is explicitly labeled
  aspirational.

## Rationale

1. **Derivation beats declaration, again.** The mapping cannot describe rules
   that were renamed or removed — the test enforces it.
2. **Empty is information.** A labeled zero tells roadmap planning exactly
   where the next packs go; a padded mapping would hide the gaps this
   taxonomy exists to reveal.
3. **No second framework.** Categories never score, gate, or dampen — they
   observe. If a domain ever needs its own rules, they land as normal packs
   and the counts move by themselves.

## Consequences

**Good:** future domains are addressable today (`vision` has an id before it
has rules); the next pack author knows precisely which zeros to fill;
`usa categories --format json` gives dashboards the axis without new schema.

**Bad:** five zeros invite "why is networking empty?" — the intended
question, but it will be asked repeatedly until packs land.

**Neutral:** category ids are stable API now; renaming one later breaks
consumers of the JSON, so the ten ids are chosen conservatively.
