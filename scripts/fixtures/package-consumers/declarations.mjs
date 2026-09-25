import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finalizeDeclarations } from '../../finalize-declarations.mjs';

const directory = mkdtempSync(join(tmpdir(), 'artemis-declarations-'));
mkdirSync(join(directory, 'nested'));
writeFileSync(join(directory, 'value.d.ts'), 'export type Value = string;');
writeFileSync(join(directory, 'nested/index.d.ts'), "export * from '../value';");
writeFileSync(
  join(directory, 'index.d.ts'),
  [
    "export * from './nested';",
    "import type { Value } from './value';",
    "export type Again = import('./value').Value;",
    "export type Untouched = import('external-package').Value;",
    "export * from './value.js';",
    "// './value' in a comment must remain unchanged.",
  ].join('\n')
);
assert.equal(finalizeDeclarations(directory), 2);
assert.match(readFileSync(join(directory, 'index.d.ts'), 'utf8'), /from '\.\/nested\/index\.js'/);
assert.match(readFileSync(join(directory, 'index.d.ts'), 'utf8'), /import\('\.\/value\.js'\)/);
assert.match(readFileSync(join(directory, 'index.d.ts'), 'utf8'), /\/\/ '\.\/value' in a comment/);
assert.equal(finalizeDeclarations(directory), 0);
writeFileSync(join(directory, 'invalid.d.ts'), "export * from './missing';");
assert.throws(() => finalizeDeclarations(directory), /Unresolved declaration import/);
console.log(
  'PASS: declaration file/directory/import-type resolution, comments, idempotence, errors'
);
