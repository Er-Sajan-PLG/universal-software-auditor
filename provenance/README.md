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
