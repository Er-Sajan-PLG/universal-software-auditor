/**
 * Build the Verification Summary Attestation for a release (SUP-023).
 *
 * The release workflow runs this AFTER `gh attestation verify` passes on the
 * tarball, so a VSA file exists if and only if verification passed — the gate
 * is the exit code of the verifier, not this script. Every field below is
 * derived from the run (env), never invented: digests are sha256sum output,
 * the policy digest pins the exact workflow file that performed the check.
 *
 * Env: VSA_TARBALL_NAME, VSA_TARBALL_DIGEST (hex sha256), VSA_BUNDLE_DIGEST
 * (hex sha256 of the .sigstore.json file), VSA_VERSION, VSA_SHA (release
 * commit), VSA_POLICY_DIGEST (hex sha256 of release.yml at that commit),
 * VSA_TIME (RFC 3339), VSA_GH_VERSION, VSA_OUT. All required: an unknown
 * value fails the build rather than shipping an empty digest.
 */
import fs from 'node:fs';

const REPO = 'Er-Sajan-PLG/universal-software-auditor';

export function buildVSA(env) {
  const required = [
    'VSA_TARBALL_NAME',
    'VSA_TARBALL_DIGEST',
    'VSA_BUNDLE_DIGEST',
    'VSA_VERSION',
    'VSA_SHA',
    'VSA_POLICY_DIGEST',
    'VSA_TIME',
    'VSA_GH_VERSION',
  ];
  for (const k of required) {
    if (!env[k]) throw new Error(`make-vsa: missing env ${k}`);
  }
  const tarballUrl = `https://registry.npmjs.org/@xenos1996/usa/-/usa-${env.VSA_VERSION}.tgz`;
  return {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [
      {
        name: env.VSA_TARBALL_NAME,
        digest: { sha256: env.VSA_TARBALL_DIGEST },
      },
    ],
    predicateType: 'https://slsa.dev/verification_summary/v1',
    predicate: {
      verifier: {
        id: `https://github.com/${REPO}/.github/workflows/release.yml`,
        version: { gh: env.VSA_GH_VERSION },
      },
      timeVerified: env.VSA_TIME,
      resourceUri: tarballUrl,
      policy: {
        uri: `https://github.com/${REPO}/blob/${env.VSA_SHA}/.github/workflows/release.yml`,
        digest: { sha256: env.VSA_POLICY_DIGEST },
      },
      inputAttestations: [
        {
          uri: `https://api.github.com/repos/${REPO}/attestations/sha256:${env.VSA_TARBALL_DIGEST}`,
          digest: { sha256: env.VSA_BUNDLE_DIGEST },
        },
      ],
      verificationResult: 'PASSED',
      verifiedLevels: ['SLSA_BUILD_LEVEL_2'],
      slsaVersion: '1.1',
    },
  };
}

const invoked = process.argv[1] === new URL(import.meta.url).pathname;
if (invoked) {
  const vsa = buildVSA(process.env);
  fs.writeFileSync(process.env.VSA_OUT, `${JSON.stringify(vsa, null, 2)}\n`, 'utf8');
  console.log(`wrote ${process.env.VSA_OUT}`);
}
