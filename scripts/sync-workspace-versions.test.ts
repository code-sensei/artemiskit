import { expect, test } from 'bun:test';
import { syncWorkspaceVersions } from './sync-workspace-versions.mjs';

test('refreshes workspace metadata without changing dependency resolutions', () => {
  const lock =
    '{\n  "workspaces": {\n    "packages/core": {\n      "name": "@artemiskit/core",\n      "version": "0.5.3",\n    },\n  },\n  "packages": {"external": ["external@0.5.3"]}\n}\n';
  const versions = new Map([['packages/core', '0.6.0']]);
  const result = syncWorkspaceVersions(lock, versions);
  expect(result).toBe(lock.replace('"version": "0.5.3"', '"version": "0.6.0"'));
  expect(syncWorkspaceVersions(result, versions)).toBe(result);
  expect(() => syncWorkspaceVersions(lock, new Map([['packages/missing', '0.6.0']]))).toThrow(
    'Unrecognized'
  );
  expect(() => syncWorkspaceVersions(lock, new Map([['packages/core', 'invalid']]))).toThrow(
    'Invalid'
  );
});
