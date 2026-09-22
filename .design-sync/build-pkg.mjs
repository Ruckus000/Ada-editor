// Stages design-system/ as a built package for the design-sync converter.
//
// The repo ships no dist/: the primitives are type-checked in place and
// rendered by the a11y harness straight from source. The converter wants a
// published-package layout (an ESM entry, a .d.ts tree, a stylesheet), so this
// builds one into .design-sync/.cache/pkg/ (gitignored) from the real source:
//
//   dist/index.js       esbuild ESM build of design-system/primitives/index.ts
//   dist/primitives.css design-system/primitives/primitives.css, verbatim
//   types/*.d.ts        tsc declarations - the props contract the design agent reads
//   tokens/tokens.css   design-system/tokens.css, verbatim
//
// Run from the repo root: node .design-sync/build-pkg.mjs

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { build } from 'esbuild';

const OUT = '.design-sync/.cache/pkg';
const SRC = 'design-system/primitives';
const root = JSON.parse(readFileSync('package.json', 'utf8'));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'dist'), { recursive: true });
mkdirSync(join(OUT, 'tokens'), { recursive: true });

await build({
  entryPoints: [join(SRC, 'index.ts')],
  outfile: join(OUT, 'dist/index.js'),
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  packages: 'external',
  target: 'es2022',
  logLevel: 'warning',
});

// Declarations from the same source the harness type-checks. Passing files on
// the CLI ignores tsconfig.json, so the relevant options are restated here
// (noEmit and allowImportingTsExtensions there would block emit).
execFileSync(
  'node_modules/.bin/tsc',
  [
    join(SRC, 'index.ts'),
    '--declaration', '--emitDeclarationOnly',
    '--outDir', join(OUT, 'types'),
    '--rootDir', SRC,
    '--jsx', 'react-jsx',
    '--module', 'esnext',
    '--moduleResolution', 'bundler',
    '--target', 'es2022',
    '--strict',
    '--skipLibCheck',
  ],
  { stdio: 'inherit' },
);

cpSync(join(SRC, 'primitives.css'), join(OUT, 'dist/primitives.css'));
cpSync('design-system/tokens.css', join(OUT, 'tokens/tokens.css'));

writeFileSync(
  join(OUT, 'package.json'),
  JSON.stringify(
    {
      name: root.name,
      version: root.version,
      type: 'module',
      module: 'dist/index.js',
      types: 'types/index.d.ts',
      dependencies: root.dependencies,
    },
    null,
    2,
  ) + '\n',
);

console.log(`staged ${root.name}@${root.version} -> ${OUT}`);
