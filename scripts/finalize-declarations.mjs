import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Bundler resolution accepts extensionless imports; NodeNext declaration consumers do not.
// Rewrite emitted declarations only, resolving against actual sibling declarations.
export function finalizeDeclarations(directory) {
  let changed = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      changed += finalizeDeclarations(file);
      continue;
    }
    if (!entry.name.endsWith('.d.ts')) continue;
    const original = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true);
    const edits = [];
    function visit(node) {
      const literal =
        ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? node.moduleSpecifier
          : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
            ? node.argument.literal
            : undefined;
      if (literal && ts.isStringLiteral(literal) && literal.text.startsWith('.')) {
        const specifier = literal.text;
        if (!/\.(?:[cm]?js|json)$/.test(specifier)) {
          const sibling = resolve(dirname(file), specifier);
          const suffix = existsSync(`${sibling}.d.ts`)
            ? '.js'
            : existsSync(join(sibling, 'index.d.ts'))
              ? '/index.js'
              : undefined;
          if (!suffix) throw new Error(`Unresolved declaration import ${specifier} in ${file}`);
          edits.push({
            start: literal.getStart(source) + 1,
            end: literal.getEnd() - 1,
            value: specifier + suffix,
          });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    let output = original;
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      output = output.slice(0, edit.start) + edit.value + output.slice(edit.end);
    }
    if (output !== original) {
      writeFileSync(file, output);
      changed++;
    }
  }
  return changed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/finalize-declarations.mjs <dist>');
  console.log(`Finalized ${finalizeDeclarations(resolve(process.argv[2]))} declarations`);
}
