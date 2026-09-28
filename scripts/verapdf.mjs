/**
 * veraPDF, the reference PDF/UA validator, shared by the PDF gate
 * (verify-pdf.mjs) and the end-to-end test (verify-e2e.mjs). The jars are
 * fetched from Maven Central on first use (scripts/verapdf/pom.xml pins the
 * version) into scripts/verapdf/lib, which is gitignored.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERAPDF = resolve(dirname(fileURLToPath(import.meta.url)), 'verapdf');
const LIB = join(VERAPDF, 'lib');

const have = (cmd) => spawnSync(cmd, ['-version'], { stdio: 'ignore' }).error === undefined;
const hasJars = () => existsSync(LIB) && readdirSync(LIB).some((f) => f.startsWith('cli-'));

/** Make veraPDF runnable, fetching it if needed. { ok } or { ok: false, why }. */
export function ensureVeraPdf({ verbose = false } = {}) {
  if (!have('java')) return { ok: false, why: 'java is not installed' };
  if (hasJars()) return { ok: true };
  if (!have('mvn')) return { ok: false, why: 'veraPDF is not fetched and mvn is not installed' };
  console.log('  fetching veraPDF from Maven Central…');
  const fetched = spawnSync('mvn', ['-q', '-f', join(VERAPDF, 'pom.xml'), 'dependency:copy-dependencies', `-DoutputDirectory=${LIB}`], { stdio: verbose ? 'inherit' : 'pipe', encoding: 'utf8' });
  if (fetched.status !== 0 || !hasJars()) {
    return { ok: false, why: `mvn could not fetch veraPDF: ${(fetched.stderr || fetched.stdout || '').trim().split('\n').slice(-3).join(' ')}` };
  }
  return { ok: true };
}

/**
 * Validate PDFs against PDF/UA-1. Returns { results, error }: results maps each
 * file path to { failed, describe } — failed is the sorted, de-duplicated list
 * of failed rules as "clause-test" ids; describe(ids) adds each rule's text.
 * error is set when veraPDF produced no report at all.
 */
export function validatePdfUa(files) {
  const run = spawnSync('java', ['-cp', `${LIB}/*`, 'org.verapdf.apps.GreenfieldCliWrapper', '--flavour', 'ua1', '--format', 'json', ...files], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    return { results: new Map(), error: `veraPDF produced no report (exit ${run.status}): ${(run.stderr || '').trim().split('\n').slice(-3).join(' ')}` };
  }
  const results = new Map();
  for (const job of report?.report?.jobs ?? []) {
    const result = [job.validationResult].flat()[0];
    if (!result) {
      results.set(job.itemDetails.name, { failed: null, status: job.jobEndStatus ?? 'unknown status', describe: () => '' });
      continue;
    }
    const rules = result.details?.ruleSummaries ?? [];
    const failed = [...new Set(rules.map((r) => `${r.clause}-${r.testNumber}`))].sort();
    const describe = (ids) => ids.map((id) => {
      const rule = rules.find((r) => `${r.clause}-${r.testNumber}` === id);
      return rule ? `${id} (${rule.description.slice(0, 90)}…)` : id;
    }).join('; ') || 'none';
    results.set(job.itemDetails.name, { failed, describe });
  }
  return { results, error: null };
}
