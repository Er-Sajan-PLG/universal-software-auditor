# Release provenance bundles (SUP-022)

Each `v*.sigstore.json` file in this directory is the Sigstore bundle
attesting the release tarball of that version: what was built, from which
commit, in which workflow run. The Release workflow mints it with GitHub
Artifact Attestations and files it here through a normal pull request —
provenance that bypassed review would prove nothing.

Verify a tarball against its bundle:

```bash
gh attestation verify <tarball> --repo Er-Sajan-PLG/universal-software-auditor
```

The npm registry carries its own independent provenance for the same
release (published with Sigstore attestation), verifiable with
`npm audit signatures`. Two channels, same claim: the tarball you
installed is the tarball the release built.

## Verification summaries (SUP-023)

Each `v*.vsa.json` next to a bundle records that the release workflow
verified the tarball before filing it: Sigstore validity, repository
identity, SLSA provenance predicate, digest match. A VSA file exists if
and only if that check passed — the job fails before filing otherwise.

Re-run the check yourself with the same command the workflow uses:

```bash
gh attestation verify <tarball> --repo Er-Sajan-PLG/universal-software-auditor --predicate-type https://slsa.dev/provenance/v1
```

The statement follows the SLSA verification_summary shape: verifier,
time, resource, policy (pinned by digest), input attestation, verdict.
