/**
 * Loads the PDF exporter for plain Node: esbuild compiles pdf-entry.ts (the
 * exporter, the seeds, the checker and the schema) into a temporary module,
 * and the fonts are read from public/, the same bytes the browser fetches.
 * Shared by verify-pdf.mjs and verify-check-posted.mjs.
 */
import { build } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

/** { mod, fonts }: mod is pdf-entry.ts's exports. `name` keeps callers' bundles apart. */
export async function loadPdfHarness(name) {
  const outfile = resolve(HERE, `../.${name}-bundle.mjs`);
  await build({
    entryPoints: [resolve(HERE, 'pdf-entry.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    packages: 'external',
    outfile,
    logLevel: 'warning',
  });
  process.on('exit', () => rmSync(outfile, { force: true }));
  const mod = await import(pathToFileURL(outfile).href);
  const fonts = Object.fromEntries(Object.entries(mod.exportPdf.PDF_FONT_FILES).map(([face, url]) => [face, readFileSync(join(ROOT, 'public', url))]));
  return { mod, fonts };
}
