#!/usr/bin/env node
/**
 * Refreshes app/_contact/disposable-domains.json from the open-source
 * disposable-email-domains blocklist (CC0 1.0, public domain):
 * https://github.com/disposable-email-domains/disposable-email-domains
 *
 * The contact route holds (never refuses) messages whose reply-to is on it.
 * Run by hand when you want a newer list; the diff shows what changed.
 *
 *   node scripts/update-disposable-domains.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = 'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../app/_contact/disposable-domains.json');

const res = await fetch(SRC);
if (!res.ok) { console.error(`fetch failed: ${res.status}`); process.exit(1); }
const domains = [...new Set((await res.text()).split('\n').map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#')))].sort();
if (domains.length < 1000) { console.error(`suspiciously short list (${domains.length}); not writing`); process.exit(1); }
writeFileSync(OUT, JSON.stringify({ source: SRC, license: 'CC0-1.0', fetched: new Date().toISOString().slice(0, 10), domains }) + '\n');
console.log(`wrote ${domains.length} domains to ${OUT}`);
