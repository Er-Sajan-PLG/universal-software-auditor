import { describe, it, expect } from 'vitest';
import config from '../../vitest.config.js';

/**
 * TAS-008: a stray `.only` must fail the build instead of silently
 * shrinking the suite. The guard is `allowOnly` in vitest.config.ts,
 * mirroring vitest's own default (`!CI`) explicitly so it is visible,
 * grep-detectable, and pinned against upstream default changes.
 *
 * Behavior proven by hand (documented, re-verifiable in seconds): a scratch
 * `.only` file fails under `CI=true` ("Unexpected .only modifier"), passes
 * locally, and fails under `--allowOnly=false` regardless of env. A nested
 * vitest subprocess test was tried and dropped: it can only see scratch
 * files by abandoning the project config, which is exactly the line under
 * test — so it would prove the default, not the guard.
 */
describe('determinism guard (TAS-008)', () => {
  it('pins allowOnly to the CI environment explicitly', () => {
    expect(config.test?.allowOnly).toBe(!process.env.CI);
  });
});
