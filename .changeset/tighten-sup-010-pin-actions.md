---
'@xenos1996/usa': patch
---

Tighten `SUP-010` to require a full commit SHA on every GitHub Action, not just the absence of `@main`/`@master`/`@latest` — a semver tag like `@v4` is still a mutable ref OpenSSF Scorecard flags. Adds `scripts/pin-actions.mjs` (`pnpm actions:pin` / `actions:check`, wired into the Lint job) and skips comment lines so the rule no longer fires on prose that quotes the syntax.
