import { describe, expect, test } from 'bun:test';
import { parseRemoteTag, validateReleaseManifest, verifyRelease } from './verify-release.mjs';

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
            ...manifest.packages.map((pkg) => [pkg.name, pkg.version]),
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
