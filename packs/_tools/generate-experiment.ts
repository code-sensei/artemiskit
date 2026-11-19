/**
 * Regenerate a pack's experiment.yaml from its task files.
 *
 * Usage: bun packs/_tools/generate-experiment.ts <pack-dir> --language <bcp47> --policy <id>
 *
 * Reads <pack-dir>/experiment.template.yaml, replaces __WORKLOAD__, __RUBRIC__ and __TASKS__,
 * and writes <pack-dir>/experiment.yaml. Run it after any change to a task file or RUBRIC.md;
 * the pack test fails until the digests match again.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { listTaskPaths, sha256, workloadDigest } from './pack-contract-digests';

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: { language: { type: 'string' }, policy: { type: 'string' } },
});

const [packArgument] = positionals;
if (!packArgument || !values.language || !values.policy) {
  console.error(
    'Usage: bun packs/_tools/generate-experiment.ts <pack-dir> --language <bcp47> --policy <id>'
  );
  process.exit(2);
}

const packDir = resolve(packArgument);
const pairs = listTaskPaths(packDir).map(
  (path) => [path, sha256(readFileSync(join(packDir, path)))] as const
);
const tasks = pairs
  .map(([path, digest]) =>
    [
      `  - id: ${path.slice('tasks/'.length, -'.yaml'.length)}`,
      '    kind: scenario_evaluation',
      '    source:',
      '      kind: scenario_evaluation',
      `      path: ${path}`,
      '      artifact:',
      "        schema_version: '1'",
      '        algorithm: sha256',
      `        digest: ${digest}`,
      '    required_capabilities: []',
      `    language: ${values.language}`,
      `    policy: ${values.policy}`,
    ].join('\n')
  )
  .join('\n');

const template = readFileSync(join(packDir, 'experiment.template.yaml'), 'utf8');
const output = template
  .replace('__WORKLOAD__', workloadDigest(pairs))
  .replace('__RUBRIC__', sha256(readFileSync(join(packDir, 'RUBRIC.md'))))
  .replace('__TASKS__', tasks);
writeFileSync(join(packDir, 'experiment.yaml'), output);
console.log(`${pairs.length} tasks written to ${join(packDir, 'experiment.yaml')}`);
