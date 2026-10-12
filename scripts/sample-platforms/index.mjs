#!/usr/bin/env node
/**
 * The platform sampler: what agenda systems do to tagged PDFs, measured on the
 * files Florida towns already publish, so no clerk has to post anything. Why it
 * exists and what it may and may not publish:
 * docs/audit/agenda-platforms-2026-10.md ("Platform testing without clerks").
 *
 *   npm run sample-platforms -- discover
 *   npm run sample-platforms -- run --platform civicclerk [--towns 25] [--tenant alachuafl] [--dry-run] [--vera] [--record]
 *   npm run sample-platforms -- summary [--platform civicclerk]
 *
 * Per-town results go to scripts/sample-platforms/out/ (gitignored) and stay
 * there: the repository is public, and a list of towns whose packets lose their
 * tags is exactly what a plaintiff firm would want. Only `summary`, which names
 * platforms and never towns, goes into the docs.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureVeraPdf } from '../verapdf.mjs';
import { createFetcher } from './fetch.mjs';
import { createRecorder } from './fixtures.mjs';
import { sampleTenant } from './runner.mjs';
import { ADAPTERS, DISABLED, loadAdapter } from './adapters/index.mjs';
import { discover } from './discover.mjs';
import { summarize } from './summary.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT = join(HERE, 'out');
const TENANTS = join(HERE, 'tenants.json');

const args = process.argv.slice(2);
const command = args[0];
const arg = (flag, fallback) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : fallback; };
const has = (flag) => args.includes(flag);
const log = (...m) => console.log(...m);

/** Seeded shuffle, so a rerun samples the same towns. */
function shuffle(list, seed) {
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

async function run() {
  const platform = arg('--platform');
  if (DISABLED[platform]) { console.error(`${platform} is switched off: ${DISABLED[platform]}.`); process.exit(2); }
  const adapter = await loadAdapter(platform);
  if (!adapter) { console.error(`--platform must be one of: ${Object.keys(ADAPTERS).join(', ')}`); process.exit(2); }
  if (!existsSync(TENANTS)) { console.error('No tenants.json yet: run `discover` first.'); process.exit(2); }
  const all = JSON.parse(readFileSync(TENANTS, 'utf8')).tenants.filter((t) => t.platform === platform && !t.exclude);
  const only = arg('--tenant');
  const pool = only ? all.filter((t) => t.tenant === only) : shuffle(all, 20261012);
  const wanted = Number(arg('--towns', '25'));
  const live = createFetcher({ log });
  const fetcher = has('--record') ? createRecorder(live, platform) : live;
  if (has('--vera')) { const v = ensureVeraPdf(); if (!v.ok) { console.error(`--vera: ${v.why}`); process.exit(2); } }
  const ctx = { fetcher, log, record: has('--record'), sinceDays: Number(arg('--since-days', '120')), dryRun: has('--dry-run'), vera: has('--vera'), maxAttachments: Number(arg('--max-attachments', '100')) };
  mkdirSync(OUT, { recursive: true });
  const outFile = join(OUT, `${platform}.jsonl`);
  log(`Sampling ${platform}: up to ${wanted} of ${pool.length} Florida tenants${ctx.dryRun ? ' (dry run: listings only)' : ''}`);
  let done = 0;
  for (const tenant of pool) {
    if (done >= wanted) break;
    log(`- ${tenant.tenant}`);
    let row;
    try { row = await sampleTenant(adapter, tenant, ctx); } catch (error) { row = { platform, tenant: tenant.tenant, errors: [`crashed: ${error.message}`] }; }
    const ok = row.meeting && (row.dryRun || row.attachments?.length || row.packet);
    if (ok) done++;
    const tagged = row.attachments?.filter((a) => a.inspection?.tagged).length ?? 0;
    log(ok
      ? `  ${row.meeting.date}: ${row.dryRun ? `${row.dryRun.attachments.length} attachments, packet ${row.dryRun.packet ? 'yes' : 'no'}` : `${row.attachments.length} attachments (${tagged} tagged), packet ${row.packet ? (row.packet.verdict?.tags ?? row.packet.error) : 'none'}`}`
      : `  skipped: ${row.errors.at(-1)}`);
    if (!ctx.dryRun) appendFileSync(outFile, JSON.stringify(row) + '\n');
  }
  const stats = fetcher.stats();
  log(`\n${done} towns sampled, ${stats.requests} requests, ${(stats.runBytes / 1024 / 1024).toFixed(1)} MB${Object.keys(stats.blockedHosts).length ? `; stopped hosts: ${Object.keys(stats.blockedHosts).length}` : ''}`);
  if (!ctx.dryRun) log(`Results (local only, never committed): ${outFile}`);
}

if (command === 'run') await run();
else if (command === 'discover') await discover({ log, tenantsPath: TENANTS, apply: has('--write') });
else if (command === 'summary') {
  const files = existsSync(OUT) ? readdirSync(OUT).filter((f) => f.endsWith('.jsonl')) : [];
  const rows = files.flatMap((f) => readFileSync(join(OUT, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  console.log(summarize(rows, { platform: arg('--platform') }));
} else {
  console.error('Usage: npm run sample-platforms -- discover [--write] | run --platform <p> [--towns 25] [--tenant t] [--dry-run] [--vera] [--record] | summary [--platform p]');
  process.exit(2);
}
