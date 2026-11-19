import { describe, expect, test } from 'bun:test';
import {
  expectedPreviousMilestone,
  isMilestoneVersion,
  parseRemoteTag,
  validateReleaseManifest,
  verifyRelease,
} from './verify-release.mjs';

const manifest = {
  schema_version: 1,
  milestone: '0.6.1',
  tag: 'v0.6.1',
  previous: '0.6.0',
  packages: [
    { name: '@artemiskit/core', version: '0.6.1' },
    { name: '@artemiskit/sdk', version: '0.5.1' },
  ],
};
const dependencies = {
  recordedMilestones: async () => ['0.6.0', '0.6.1'],
  packageVersions: async () => new Map(manifest.packages.map((pkg) => [pkg.name, pkg.version])),
  registryPackage: async (name: string) => ({
    versions: {
      '0.6.0': { dist: { integrity: 'test-integrity' } },
      '0.5.0': { dist: { integrity: 'test-integrity' } },
      '0.6.1': { dist: { integrity: 'test-integrity' } },
      '0.5.1': { dist: { integrity: 'test-integrity' } },
    },
    'dist-tags': { latest: name === '@artemiskit/core' ? '0.6.1' : '0.5.1' },
  }),
  remoteTag: async () => ({ exists: true, annotated: true, commit: 'test-head' }),
  head: async () => 'test-head',
  previousManifest: async () => ({
    ...manifest,
    milestone: '0.6.0',
    tag: 'v0.6.0',
    previous: null,
    packages: [
      { name: '@artemiskit/core', version: '0.6.0' },
      { name: '@artemiskit/sdk', version: '0.5.0' },
    ],
  }),
};

describe('sequential milestone release gates', () => {
  test('retains independent package versions within one milestone', () => {
    expect(validateReleaseManifest(manifest)).toEqual(manifest);
  });
  test('rejects skipped predecessor, mismatched core and duplicate packages', () => {
    expect(() => validateReleaseManifest({ ...manifest, previous: '0.5.3' })).toThrow();
    expect(() =>
      validateReleaseManifest({ ...manifest, milestone: '0.6.2', tag: 'v0.6.2', previous: '0.6.1' })
    ).toThrow();
    expect(() =>
      validateReleaseManifest({
        ...manifest,
        packages: [manifest.packages[0], manifest.packages[0]],
      })
    ).toThrow();
  });
  test('rejects unsafe package/tag identifiers and unknown fields', () => {
    expect(() => validateReleaseManifest({ ...manifest, tag: '--delete' })).toThrow();
    expect(() => validateReleaseManifest({ ...manifest, extra: true })).toThrow();
    expect(() =>
      validateReleaseManifest({ ...manifest, packages: [{ name: '../secret', version: '1.0.0' }] })
    ).toThrow();
  });
  test('first milestone has no artificial previous 0.6 milestone', async () => {
    const first = {
      ...manifest,
      milestone: '0.6.0',
      tag: 'v0.6.0',
      previous: null,
      packages: [{ name: '@artemiskit/core', version: '0.6.0' }],
    };
    const result = await verifyRelease('prepublish', first, {
      recordedMilestones: async () => ['0.6.0'],
      packageVersions: async () => new Map([['@artemiskit/core', '0.6.0']]),
      remoteTag: async () => ({ exists: false }),
      head: async () => 'first-candidate',
    });
    expect(result.status).toBe('passed');
  });
  test('requires local version parity before publishing', async () => {
    await expect(
      verifyRelease('local', manifest, { ...dependencies, packageVersions: async () => new Map() })
    ).rejects.toThrow('mismatch');
  });
  test('requires both prior npm version and annotated remote milestone tag', async () => {
    expect((await verifyRelease('prepublish', manifest, dependencies)).status).toBe('passed');
    await expect(
      verifyRelease('prepublish', manifest, {
        ...dependencies,
        remoteTag: async () => ({ exists: false }),
      })
    ).rejects.toThrow('Previous milestone');
    await expect(
      verifyRelease('prepublish', manifest, {
        ...dependencies,
        registryPackage: async () => ({ versions: {} }),
      })
    ).rejects.toThrow('Previous milestone');
  });
  test('requires registry integrity and expected latest for each package', async () => {
    expect((await verifyRelease('registry', manifest, dependencies)).status).toBe('passed');
    await expect(
      verifyRelease('registry', manifest, {
        ...dependencies,
        registryPackage: async () => ({ versions: {} }),
      })
    ).rejects.toThrow('verification failed');
  });
  test('rejects a partially published predecessor even when core is available', async () => {
    await expect(
      verifyRelease('prepublish', manifest, {
        ...dependencies,
        registryPackage: async (name: string) =>
          name === '@artemiskit/sdk' ? { versions: {} } : dependencies.registryPackage(name),
      })
    ).rejects.toThrow('Previous milestone package');
  });
  test('refuses to let Changesets publish unlisted workspace versions', async () => {
    await expect(
      verifyRelease('prepublish', manifest, {
        ...dependencies,
        packageVersions: async () =>
          new Map([
            ...manifest.packages.map((pkg): [string, string] => [pkg.name, pkg.version]),
            ['@artemiskit/reports', '0.9.0'],
          ]),
      })
    ).rejects.toThrow('missing from release manifest');
  });
  test('requires every annotated package and milestone tag at released HEAD', async () => {
    expect((await verifyRelease('tags', manifest, dependencies)).status).toBe('passed');
    await expect(
      verifyRelease('tags', manifest, {
        ...dependencies,
        remoteTag: async () => ({ exists: true, annotated: true, commit: 'other' }),
      })
    ).rejects.toThrow('revision');
    await expect(
      verifyRelease('tags', manifest, {
        ...dependencies,
        remoteTag: async () => ({ exists: true, annotated: false, commit: 'test-head' }),
      })
    ).rejects.toThrow('revision');
  });
  test('annotated tags resolve to commits rather than tag objects', () => {
    expect(
      parseRemoteTag('tag-object\trefs/tags/v0.6.0\ncommit\trefs/tags/v0.6.0^{}\n', 'v0.6.0')
    ).toEqual({ exists: true, annotated: true, commit: 'commit' });
    expect(parseRemoteTag('', 'v0.6.0').exists).toBe(false);
  });
  test('completed milestone allows later independent patches without moving old tags', async () => {
    expect(
      (
        await verifyRelease('completed', manifest, {
          ...dependencies,
          packageVersions: async () => new Map([['@artemiskit/sdk', '0.5.2']]),
          head: async () => 'new-package-release-head',
          registryPackage: async (name: string) => ({
            ...(await dependencies.registryPackage(name)),
            'dist-tags': { latest: '0.5.2' },
          }),
        })
      ).status
    ).toBe('passed');
    await expect(
      verifyRelease('completed', manifest, {
        ...dependencies,
        remoteTag: async () => ({ exists: false, annotated: false }),
      })
    ).rejects.toThrow('Previous milestone');
    await expect(
      verifyRelease('completed', manifest, {
        ...dependencies,
        remoteTag: async (name: string) => ({
          exists: true,
          annotated: true,
          commit: name.startsWith('@artemiskit/sdk') ? 'wrong-revision' : 'test-head',
        }),
      })
    ).rejects.toThrow('incomplete');
  });
  test('rejects conflicting current release tags before publication', async () => {
    await expect(
      verifyRelease('prepublish', manifest, {
        ...dependencies,
        remoteTag: async (name: string) => ({
          exists: true,
          annotated: true,
          commit: name === 'v0.6.1' ? 'different-candidate' : 'test-head',
        }),
      })
    ).rejects.toThrow('different revision');
  });
});

const recorded06 = ['0.6.0', '0.6.1', '0.6.2', '0.6.3', '0.6.4'];
const manifest070 = {
  schema_version: 1,
  milestone: '0.7.0',
  tag: 'v0.7.0',
  previous: '0.6.4',
  packages: [
    { name: '@artemiskit/core', version: '0.7.0' },
    { name: '@artemiskit/sdk', version: '0.7.0' },
  ],
};
const manifest064 = {
  schema_version: 1,
  milestone: '0.6.4',
  tag: 'v0.6.4',
  previous: '0.6.3',
  packages: [
    { name: '@artemiskit/core', version: '0.6.4' },
    { name: '@artemiskit/sdk', version: '0.6.3' },
  ],
};
const lineTransition = {
  ...dependencies,
  recordedMilestones: async () => [...recorded06, '0.7.0'],
  packageVersions: async () => new Map(manifest070.packages.map((pkg) => [pkg.name, pkg.version])),
  registryPackage: async () => ({
    versions: {
      '0.6.4': { dist: { integrity: 'test-integrity' } },
      '0.6.3': { dist: { integrity: 'test-integrity' } },
      '0.7.0': { dist: { integrity: 'test-integrity' } },
    },
  }),
  previousManifest: async () => manifest064,
};

describe('milestone sequence across release lines', () => {
  test('recognizes milestone versions from 0.6.0 onward', () => {
    expect(['0.6.0', '0.6.4', '0.7.0', '0.10.3', '1.0.0'].map(isMilestoneVersion)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(['0.5.3', '0.7', 'v0.7.0', '0.7.0-rc.1', undefined].map(isMilestoneVersion)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
  test('derives previous from the recorded sequence: 0.7.0 names 0.6.4', () => {
    expect(expectedPreviousMilestone('0.6.0', recorded06)).toBeNull();
    expect(expectedPreviousMilestone('0.6.3', recorded06)).toBe('0.6.2');
    expect(expectedPreviousMilestone('0.7.0', recorded06)).toBe('0.6.4');
    expect(expectedPreviousMilestone('0.7.1', [...recorded06, '0.7.0'])).toBe('0.7.0');
    expect(expectedPreviousMilestone('1.0.0', [...recorded06, '0.7.0', '0.9.2', '0.9.3'])).toBe(
      '0.9.3'
    );
    expect(validateReleaseManifest(manifest070, recorded06)).toEqual(manifest070);
  });
  test('rejects a skipped milestone at the line transition', () => {
    // 0.6.4 is recorded, so a 0.7.0 that names 0.6.3 skips it.
    expect(() =>
      validateReleaseManifest({ ...manifest070, previous: '0.6.3' }, recorded06)
    ).toThrow('immediately preceding');
    // Without the 0.6.4 manifest the 0.6 line ends at 0.6.3, so naming 0.6.4 is refused.
    expect(() => validateReleaseManifest(manifest070, recorded06.slice(0, 4))).toThrow(
      'immediately preceding'
    );
    // With no recorded 0.6 milestone the line opener has no predecessor to derive.
    expect(() => validateReleaseManifest(manifest070, [])).toThrow('cannot be skipped');
    expect(() => validateReleaseManifest({ ...manifest070, previous: null }, recorded06)).toThrow(
      'immediately preceding'
    );
    expect(() =>
      validateReleaseManifest({ ...manifest070, previous: '0.7.0' }, recorded06)
    ).toThrow();
  });
  test('rejects a skipped patch milestone or release line', () => {
    const manifest072 = {
      ...manifest070,
      milestone: '0.7.2',
      tag: 'v0.7.2',
      previous: '0.7.1',
      packages: [{ name: '@artemiskit/core', version: '0.7.2' }],
    };
    expect(() => validateReleaseManifest(manifest072, [...recorded06, '0.7.0'])).toThrow(
      'cannot be skipped'
    );
    expect(validateReleaseManifest(manifest072, [...recorded06, '0.7.0', '0.7.1'])).toEqual(
      manifest072
    );
    const manifest080 = {
      ...manifest070,
      milestone: '0.8.0',
      tag: 'v0.8.0',
      packages: [{ name: '@artemiskit/core', version: '0.8.0' }],
    };
    // 0.8.0 must follow the 0.7 line; naming 0.6.4 skips it even with no 0.7 manifest recorded.
    expect(() => validateReleaseManifest(manifest080)).toThrow('immediately preceding');
    expect(() => validateReleaseManifest(manifest080, recorded06)).toThrow();
  });
  test('verifies 0.7.0 against a published and tagged 0.6.4', async () => {
    expect((await verifyRelease('prepublish', manifest070, lineTransition)).status).toBe('passed');
    await expect(
      verifyRelease('prepublish', manifest070, {
        ...lineTransition,
        recordedMilestones: async () => recorded06.slice(0, 4),
      })
    ).rejects.toThrow('immediately preceding');
    await expect(
      verifyRelease('prepublish', manifest070, {
        ...lineTransition,
        registryPackage: async () => ({ versions: {} }),
      })
    ).rejects.toThrow('Previous milestone package');
    await expect(
      verifyRelease('prepublish', manifest070, {
        ...lineTransition,
        previousManifest: async () => ({ ...manifest064, milestone: '0.6.3', tag: 'v0.6.3' }),
      })
    ).rejects.toThrow();
  });
  test('reads the recorded sequence from docs/releases by default', async () => {
    const result = await verifyRelease('local', manifest070, {
      packageVersions: lineTransition.packageVersions,
    });
    expect(result).toEqual({ milestone: '0.7.0', mode: 'local', packages: 2, status: 'passed' });
  });
  test('refuses a manifest still marked as a draft', () => {
    expect(() => validateReleaseManifest({ draft: true, ...manifest070 }, recorded06)).toThrow(
      'DRAFT'
    );
  });
});
