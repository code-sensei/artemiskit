import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertPackedDependencies,
  assertPackedFileList,
  normalizePackument,
  packCandidate,
  publishPackages,
  registryRequest,
  statusRequest,
} from './npm-publication.mjs';

const candidate = 'a'.repeat(40);
const core = { name: '@artemiskit/core', version: '0.6.1' };
const sdk = { name: '@artemiskit/sdk', version: '0.5.1' };
const mcp = { name: '@artemiskit/mcp-docker-sandbox', version: '0.1.0' };
const manifest = {
  schema_version: 1,
  milestone: '0.6.1',
  tag: 'v0.6.1',
  previous: '0.6.0',
  packages: [core, sdk],
};
const integrity = 'sha512-candidate';
const empty = () => ({ versions: {}, 'dist-tags': {} });
function published(pkg: typeof core, checksum = integrity) {
  return {
    versions: { [pkg.version]: { dist: { integrity: checksum } } },
    'dist-tags': { latest: pkg.version },
  };
}
function fixture(packages = [core]) {
  const metadata = new Map(packages.map((pkg) => [pkg.name, empty()]));
  const receipts = new Map<string, Record<string, string | number>>();
  const uploads: string[] = [];
  const tags: string[] = [];
  const logs: string[] = [];
  const lifecycle = new Map<string, string>();
  let clock = 0;
  const io = {
    registry: async (name: string) => metadata.get(name),
    load: async (pkg: typeof core) => receipts.get(pkg.name),
    save: async (pkg: typeof core, receipt: Record<string, string | number>) => {
      receipts.set(pkg.name, { ...receipt });
    },
    pack: async () => ({ archive: '/dummy/candidate.tgz', integrity }),
    status: async (pkg: typeof core) => lifecycle.get(pkg.name) ?? null,
    publish: async (pkg: typeof core) => {
      expect(receipts.get(pkg.name).state).toBe('attempted');
      uploads.push(pkg.name);
      metadata.set(pkg.name, published(pkg));
    },
    checkTag: async () => {},
    tag: async (tag: string) => {
      tags.push(tag);
    },
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
    },
    log: (line: string) => {
      logs.push(line);
    },
  };
  return { io, metadata, receipts, uploads, tags, logs, lifecycle };
}

describe('npm publication compatibility and immutable retry', () => {
  test('npm12 array and legacy object contain the same published versions; invalid metadata fails closed', () => {
    const object = published(mcp);
    expect(normalizePackument([object])).toEqual(normalizePackument(object));
    for (const value of [[], [object, object], null, {}, { versions: [] }]) {
      expect(() => normalizePackument(value)).toThrow();
    }
  });
  test('skips unchanged MCP, publishes explicit milestone, and tags only after every version is verified', async () => {
    const f = fixture([core, sdk, mcp]);
    f.metadata.set(mcp.name, published(mcp));
    const result = await publishPackages({ packages: [core, sdk, mcp], candidate, manifest }, f.io);
    expect(result.status).toBe('published');
    expect(f.uploads).toEqual([core.name, sdk.name]);
    expect(f.tags).toEqual([
      `${core.name}@${core.version}`,
      `${sdk.name}@${sdk.version}`,
      'v0.6.1',
    ]);
  });
  test('independent package mode selects absent versions without retagging historical core', async () => {
    const f = fixture([core, sdk]);
    f.metadata.set(core.name, published(core));
    await publishPackages({ packages: [core, sdk], candidate }, f.io);
    expect(f.uploads).toEqual([sdk.name]);
    expect(f.tags).toEqual([`${sdk.name}@${sdk.version}`]);
  });
  test('accepted 202 and validating remain pending until matching public integrity/latest', async () => {
    const f = fixture();
    f.io.publish = async () => {
      f.uploads.push(core.name);
      f.lifecycle.set(core.name, 'validating');
    };
    let sleeps = 0;
    const sleep = f.io.sleep;
    f.io.sleep = async (ms) => {
      await sleep(ms);
      if (++sleeps === 3) f.metadata.set(core.name, published(core));
    };
    await publishPackages({ packages: [core], candidate }, f.io);
    expect(f.uploads).toHaveLength(1);
    expect(sleeps).toBe(3);
    expect(f.logs.some((line) => line.includes('validating'))).toBe(true);
    expect(f.receipts.get(core.name).state).toBe('published');
  });
  test('pending timeout is retained and retry reconciles without a second upload', async () => {
    const f = fixture();
    f.io.publish = async () => {
      f.uploads.push(core.name);
    };
    await expect(
      publishPackages({ packages: [core], candidate, timeoutMs: 1 }, f.io)
    ).rejects.toThrow('pending after timeout');
    expect(f.tags).toHaveLength(0);
    expect(f.receipts.get(core.name).state).toBe('accepted');
    f.metadata.set(core.name, published(core));
    await publishPackages({ packages: [core], candidate }, f.io);
    expect(f.uploads).toHaveLength(1);
    expect(f.tags).toHaveLength(1);
  });
  test('uncertain failed submission also cannot be blindly retried', async () => {
    const f = fixture();
    f.io.publish = async () => {
      f.uploads.push(core.name);
      throw new Error('dummy credential must never appear');
    };
    await expect(
      publishPackages({ packages: [core], candidate, timeoutMs: 1 }, f.io)
    ).rejects.toThrow('pending');
    await expect(
      publishPackages({ packages: [core], candidate, timeoutMs: 1 }, f.io)
    ).rejects.toThrow('pending');
    expect(f.uploads).toHaveLength(1);
    expect(f.receipts.get(core.name).state).toBe('attempted');
    expect(f.logs.join('\n')).not.toContain('dummy credential');
  });
  test.each(['staged', 'blocked', 'deleted'])(
    'terminal lifecycle %s never produces success or tags',
    async (state) => {
      const f = fixture();
      f.io.publish = async () => {
        f.lifecycle.set(core.name, state);
      };
      await expect(publishPackages({ packages: [core], candidate }, f.io)).rejects.toThrow(
        state === 'staged' ? 'Manual approval' : state
      );
      expect(f.tags).toHaveLength(0);
    }
  );
  test('unrecorded pending publication is not submitted again', async () => {
    const f = fixture();
    f.lifecycle.set(core.name, 'validating');
    await expect(publishPackages({ packages: [core], candidate }, f.io)).rejects.toThrow(
      'Unrecorded publication'
    );
    expect(f.uploads).toHaveLength(0);
  });
  test('partial milestone retry checks both source revision and immutable bytes', async () => {
    const f = fixture([core, sdk]);
    f.receipts.set(core.name, {
      name: core.name,
      version: core.version,
      candidate,
      integrity,
      state: 'accepted',
    });
    f.metadata.set(core.name, published(core));
    await publishPackages({ packages: [core, sdk], candidate, manifest }, f.io);
    expect(f.uploads).toEqual([sdk.name]);
    const wrong = fixture();
    wrong.receipts.set(core.name, {
      name: core.name,
      version: core.version,
      candidate: 'b'.repeat(40),
      integrity,
      state: 'accepted',
    });
    await expect(publishPackages({ packages: [core], candidate }, wrong.io)).rejects.toThrow(
      'another candidate'
    );
    wrong.receipts.set(core.name, {
      name: core.name,
      version: core.version,
      candidate,
      integrity: 'different',
      state: 'accepted',
    });
    await expect(publishPackages({ packages: [core], candidate }, wrong.io)).rejects.toThrow(
      'identity mismatch'
    );
  });
  test('conflicting published payload or latest does not authorize a tag or republish', async () => {
    for (const mismatch of ['integrity', 'latest']) {
      const f = fixture();
      const data = published(core, mismatch === 'integrity' ? 'other' : integrity);
      if (mismatch === 'latest') data['dist-tags'].latest = '9.0.0';
      f.metadata.set(core.name, data);
      await expect(
        publishPackages(
          { packages: [core], candidate, manifest: { packages: [core], tag: 'v0.6.1' } },
          f.io
        )
      ).rejects.toThrow();
      expect(f.uploads).toHaveLength(0);
      expect(f.tags).toHaveLength(0);
    }
  });
  test('conflicting preexisting tag is rejected before submission', async () => {
    const f = fixture();
    f.io.checkTag = async () => {
      throw new Error('tag conflict');
    };
    await expect(publishPackages({ packages: [core], candidate }, f.io)).rejects.toThrow(
      'tag conflict'
    );
    expect(f.uploads).toHaveLength(0);
  });
  test('dry run only selects: no packing, receipt, upload or tags', async () => {
    const f = fixture();
    f.io.pack = async () => {
      throw new Error('must not pack');
    };
    expect(
      (await publishPackages({ packages: [core], candidate, dryRun: true }, f.io)).status
    ).toBe('dry-run');
    expect(f.receipts.size).toBe(0);
    expect(f.uploads).toHaveLength(0);
    expect(f.tags).toHaveLength(0);
  });
  test('incomplete candidate set is rejected before effects', async () => {
    const f = fixture();
    await expect(publishPackages({ packages: [core], candidate, manifest }, f.io)).rejects.toThrow(
      'cover'
    );
    expect(f.uploads).toHaveLength(0);
  });
  test('packing preserves intended internal dependency versions and rejects missing/workspace/stale values', () => {
    const source = { ...sdk, dependencies: { [core.name]: 'workspace:*', external: '^1.0.0' } };
    const packed = { ...sdk, dependencies: { [core.name]: core.version, external: '^1.0.0' } };
    expect(() => assertPackedDependencies(packed, source, [core, sdk])).not.toThrow();
    for (const value of ['workspace:*', '0.5.3', undefined]) {
      expect(() =>
        assertPackedDependencies({ ...packed, dependencies: { [core.name]: value } }, source, [
          core,
          sdk,
        ])
      ).toThrow();
    }
    expect(source.dependencies[core.name]).toBe('workspace:*');
  });
});

describe('registry transport without live credentials or writes', () => {
  test('legacy and npm12 metadata select equally; only explicit404 means missing', async () => {
    for (const payload of [published(mcp), [published(mcp)]]) {
      const result = await registryRequest(mcp.name, async () => Response.json(payload));
      expect(result.versions[mcp.version]).toBeDefined();
    }
    expect(await registryRequest(core.name, async () => new Response('', { status: 404 }))).toEqual(
      empty()
    );
    await expect(
      registryRequest(core.name, async () => new Response('', { status: 503 }))
    ).rejects.toThrow('503');
  });
  test('status uses package-scoped bearer reads; rollout absence is unknown and authentication fails closed', async () => {
    const requests: string[] = [];
    expect(
      await statusRequest(core, 'dummy-test-only', async (url: string, options: RequestInit) => {
        requests.push(url);
        expect(options.headers).toEqual({ Authorization: 'Bearer dummy-test-only' });
        return Response.json({
          packageName: core.name,
          version: core.version,
          status: 'validating',
        });
      })
    ).toBe('validating');
    expect(requests[0]).toContain('/-/package/%40artemiskit%2Fcore/version/0.6.1/status');
    for (const status of [403, 404, 429, 500, 503]) {
      expect(
        await statusRequest(core, 'dummy', async () => new Response('', { status }))
      ).toBeNull();
    }
    await expect(
      statusRequest(core, 'dummy', async () => new Response('', { status: 401 }))
    ).rejects.toThrow('401');
    await expect(
      statusRequest(core, 'dummy', async () =>
        Response.json({ packageName: sdk.name, version: core.version, status: 'published' })
      )
    ).rejects.toThrow('Invalid');
  });
});

// Two shell paths share one test deadline; each child also has its own bounded timeout.
test('shell entrypoint cleans temporary auth on success/failure and never rewrites source manifests', () => {
  for (const exit of [0, 17]) {
    const directory = mkdtempSync(join(tmpdir(), 'artemis-publish-shell-test-'));
    const bin = join(directory, 'bin');
    mkdirSync(bin);
    mkdirSync(join(directory, '.changeset'));
    writeFileSync(
      join(directory, 'publish.sh'),
      readFileSync(new URL('./publish.sh', import.meta.url))
    );
    const original = JSON.stringify({
      dependencies: { '@artemiskit/core': 'workspace:*', '@artemiskit/sdk': '0.4.0' },
    });
    writeFileSync(join(directory, 'package.json'), original);
    const programs = {
      npm: '#!/bin/sh\nprintf "%s" "$NPM_CONFIG_USERCONFIG" > "$MOCK_DIRECTORY/npmrc-path"\nprintf "fixture-user\\n"\n',
      git: '#!/bin/sh\nprintf "%s\\n" "$*" >> "$MOCK_DIRECTORY/git-calls"\nif [ "$1" = branch ]; then printf "main\\n"; fi\n',
      bun: `#!/bin/sh\nif [ "$1" = scripts/npm-publication.mjs ]; then exit ${exit}; fi\nexit 0\n`,
    };
    for (const [name, source] of Object.entries(programs)) {
      writeFileSync(join(bin, name), source);
      chmodSync(join(bin, name), 0o755);
    }
    const result = spawnSync('/bin/bash', ['publish.sh', '--dry-run'], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 5000,
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        NPM_API_KEY: 'dummy-test-only',
        MOCK_DIRECTORY: directory,
        TMPDIR: directory,
      },
    });
    expect(result.status).toBe(exit);
    expect(readFileSync(join(directory, 'package.json'), 'utf8')).toBe(original);
    expect(existsSync(readFileSync(join(directory, 'npmrc-path'), 'utf8'))).toBe(false);
    expect(`${result.stdout}${result.stderr}`).not.toContain('dummy-test-only');
    expect(result.stdout).not.toContain('Packages published successfully');
    expect(readFileSync(join(directory, 'git-calls'), 'utf8')).not.toContain('commit');
  }
}, 15000);

test('accepted upload followed by npm failure reconciles through status403/404 without resend', async () => {
  for (const http of [403, 404]) {
    const f = fixture();
    f.io.status = (pkg) =>
      statusRequest(pkg, 'dummy', async () => new Response('', { status: http }));
    f.io.publish = async () => {
      f.uploads.push(core.name);
      throw new Error('npm failed after PUT202');
    };
    const sleep = f.io.sleep;
    f.io.sleep = async (ms) => {
      await sleep(ms);
      f.metadata.set(core.name, published(core));
    };
    await publishPackages({ packages: [core], candidate }, f.io);
    expect(f.uploads).toHaveLength(1);
    expect(f.receipts.get(core.name)?.state).toBe('published');
  }
});

test('all archives pass dependency verification before any upload', async () => {
  const f = fixture([core, sdk]);
  f.io.pack = async (pkg: typeof core) => {
    if (pkg.name === sdk.name) throw new Error('invalid second archive');
    return { archive: '/dummy/archive', integrity };
  };
  await expect(
    publishPackages({ packages: [core, sdk], candidate, manifest }, f.io)
  ).rejects.toThrow('second archive');
  expect(f.uploads).toHaveLength(0);
});

test('workspace caret/tilde semantics are checked for every declared dependency group', () => {
  for (const group of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    for (const [suffix, expected] of [
      ['*', core.version],
      ['^', `^${core.version}`],
      ['~', `~${core.version}`],
    ]) {
      const source = { ...sdk, [group]: { [core.name]: `workspace:${suffix}` } };
      expect(() =>
        assertPackedDependencies({ ...sdk, [group]: { [core.name]: expected } }, source, [
          core,
          sdk,
        ])
      ).not.toThrow();
      expect(() =>
        assertPackedDependencies({ ...sdk, [group]: { [core.name]: '0.0.1' } }, source, [core, sdk])
      ).toThrow();
    }
  }
  expect(() =>
    assertPackedDependencies(
      { ...sdk, dependencies: { [core.name]: '^0.6.0' } },
      { ...sdk, dependencies: { [core.name]: 'workspace:^0.6.0' } },
      [core, sdk]
    )
  ).toThrow('Unsupported');
});

test('actual Bun tarballs preserve source bytes and resolve workspace dependencies; retained bytes are immutable', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'artemis-publication-pack-test-'));
  const localCore = { ...core, location: join(directory, 'core') };
  const localSDK = {
    ...sdk,
    location: join(directory, 'sdk'),
    dependencies: { [core.name]: 'workspace:*' },
    peerDependencies: { [core.name]: 'workspace:^' },
  };
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({ name: 'fixture-workspace', private: true, workspaces: ['core', 'sdk'] })
  );
  for (const pkg of [localCore, localSDK]) {
    mkdirSync(pkg.location);
    const { location, ...source } = pkg;
    writeFileSync(join(location, 'package.json'), JSON.stringify(source));
    writeFileSync(join(location, 'index.js'), 'export const fixture = true;\n');
  }
  const source = readFileSync(join(localSDK.location, 'package.json'), 'utf8');
  const install = spawnSync('bun', ['install', '--ignore-scripts'], {
    cwd: directory,
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  });
  expect(install.status).toBe(0);
  const archive = join(directory, 'candidate.tgz');
  const result = await packCandidate(localSDK, [localCore, localSDK], archive, null);
  expect(result.integrity).toMatch(/^sha512-/);
  expect(readFileSync(join(localSDK.location, 'package.json'), 'utf8')).toBe(source);
  expect(
    (await packCandidate(localSDK, [localCore, localSDK], archive, { integrity: result.integrity }))
      .integrity
  ).toBe(result.integrity);
  await expect(
    packCandidate(localSDK, [localCore, localSDK], archive, { integrity: 'wrong' })
  ).rejects.toThrow('integrity mismatch');
});

test('dependency-first order is deterministic and waits for each dependency publication', async () => {
  const adapter = {
    name: '@artemiskit/adapter-openai',
    version: '0.1.21',
    dependencies: { [core.name]: 'workspace:*' },
  };
  const library = {
    ...sdk,
    dependencies: { [core.name]: 'workspace:*' },
    optionalDependencies: { [adapter.name]: 'workspace:*' },
  };
  const cli = {
    name: '@artemiskit/cli',
    version: '0.5.1',
    dependencies: { [library.name]: 'workspace:*' },
  };
  for (const packages of [
    [cli, library, adapter, core],
    [adapter, core, cli, library],
  ]) {
    const f = fixture(packages);
    f.io.publish = async (pkg) => {
      for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
        expect(f.receipts.get(name)?.state).toBe('published');
      }
      f.uploads.push(pkg.name);
      f.lifecycle.set(pkg.name, 'validating');
    };
    const sleep = f.io.sleep;
    f.io.sleep = async (ms) => {
      await sleep(ms);
      const pkg = packages.find((entry) => entry.name === f.uploads.at(-1));
      f.metadata.set(pkg.name, published(pkg));
    };
    await publishPackages({ packages, candidate }, f.io);
    expect(f.uploads).toEqual([core.name, adapter.name, library.name, cli.name]);
  }
});

test('internal runtime or optional dependency cycles fail before packing, receipts or upload', async () => {
  for (const group of ['dependencies', 'optionalDependencies']) {
    const packages = [
      { ...core, dependencies: { [sdk.name]: 'workspace:*' } },
      { ...sdk, [group]: { [core.name]: 'workspace:*' } },
    ];
    const f = fixture(packages);
    f.io.pack = async () => {
      throw new Error('must not pack a cyclic candidate');
    };
    await expect(publishPackages({ packages, candidate }, f.io)).rejects.toThrow(
      'dependency cycle'
    );
    expect(f.receipts.size).toBe(0);
    expect(f.uploads).toHaveLength(0);
    expect(f.tags).toHaveLength(0);
  }
});

test('unchanged dependencies and reciprocal peer declarations do not introduce false cycles', async () => {
  const packages = [
    {
      ...sdk,
      dependencies: { [core.name]: 'workspace:*' },
      peerDependencies: { [core.name]: '*' },
    },
    { ...core, peerDependencies: { [sdk.name]: '*' } },
  ];
  const f = fixture(packages);
  f.metadata.set(core.name, published(core));
  await publishPackages({ packages, candidate }, f.io);
  expect(f.uploads).toEqual([sdk.name]);
});

describe('package runtime-artifact boundary', () => {
  test('refuses local run/checkpoint/configuration paths without echoing their names', () => {
    expect(() =>
      assertPackedFileList('package/package.json\npackage/src/index.ts\npackage/.env.example')
    ).not.toThrow();
    for (const path of [
      'package/artemis-runs/private.json',
      'package/.artemis-checkpoint/state.json',
      'package/artemis-output/report.html',
      'package/agent-evaluation-runs/run.json',
      'package/ai-trace/run.json',
      'package/.env',
      'package/src/.env.production',
      'package/.git/config',
      'package/node_modules/private/file',
      '/package/absolute',
      'package/../outside',
      'package/src/../../outside',
      'package/./file',
      'package//file',
      'outside/file',
      'package/file\tprivate',
    ]) {
      expect(() => assertPackedFileList(`package/package.json\n${path}`)).toThrow(
        'Package archive contains unsafe or local runtime files'
      );
    }
  });
  test('actual CLI allowlist excludes ignored local evidence while retaining runtime sources', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'artemis-cli-pack-boundary-'));
    const cli = JSON.parse(
      readFileSync(new URL('../packages/cli/package.json', import.meta.url), 'utf8')
    );
    const pkg = { name: '@artemiskit/cli', version: '0.6.3', location: directory };
    for (const folder of ['bin', 'dist', 'src', 'artemis-runs', '.artemis-checkpoint'])
      mkdirSync(join(directory, folder));
    for (const file of ['bin/artemis.ts', 'dist/index.js', 'src/cli.ts'])
      writeFileSync(join(directory, file), 'export {};\n');
    for (const file of ['artemis-runs/private.json', '.artemis-checkpoint/state.json'])
      writeFileSync(join(directory, file), '{"private":"fixture"}');
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({ name: pkg.name, version: pkg.version })
    );
    const archive = join(mkdtempSync(join(tmpdir(), 'artemis-cli-archive-')), 'candidate.tgz');
    await expect(packCandidate(pkg, [pkg], archive, null)).rejects.toThrow(
      'unsafe or local runtime files'
    );
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({ name: pkg.name, version: pkg.version, files: cli.files })
    );
    await packCandidate(pkg, [pkg], archive, null);
    const listing = spawnSync('tar', ['-tf', archive], { encoding: 'utf8' });
    expect(listing.status).toBe(0);
    for (const file of ['bin/artemis.ts', 'dist/index.js', 'src/cli.ts'])
      expect(listing.stdout).toContain(`package/${file}`);
    expect(listing.stdout).not.toContain('private.json');
    expect(listing.stdout).not.toContain('state.json');
    expect(readFileSync(join(directory, 'artemis-runs/private.json'), 'utf8')).toBe(
      '{"private":"fixture"}'
    );
  });
});
