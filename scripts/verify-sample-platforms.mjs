#!/usr/bin/env node
/**
 * Gate for the platform sampler (scripts/sample-platforms/). Offline: a local
 * HTTP server stands in for the platforms, and recorded listings stand in for
 * their APIs.
 *
 *   - Politeness: robots.txt is respected, requests to a host are spaced, a 403
 *     or a browser-check page stops the host, the size cap holds.
 *   - Packets: comparePacket names what a packet did to the tagged files in it
 *     (kept, removed, flattened, language dropped), and pageOrigin spots a scan.
 *   - Adapters: each one makes the expected meetings and files of its recorded
 *     listings (fixtures/<platform>/expected.json).
 *   - Privacy: a sampled row keeps no query string (some platforms sign their
 *     links), and the summary names no town.
 *
 *   node scripts/verify-sample-platforms.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { loadPdfHarness } from './harness/pdf-harness.mjs';
import { VARIANTS, scannedPdf } from './harness/pdf-variants.mjs';
import { comparePacket, inspectPdf, pageOrigin } from './posted-pdf.mjs';
import { ADAPTERS, DISABLED, loadAdapter } from './sample-platforms/adapters/index.mjs';
import { createFetcher, parseRobots, robotsAllows, stripQuery } from './sample-platforms/fetch.mjs';
import { FIXTURES, createReplayer, redact } from './sample-platforms/fixtures.mjs';
import { sampleTenant } from './sample-platforms/runner.mjs';
import { summarize } from './sample-platforms/summary.mjs';

let passed = 0;
const failures = [];
const check = async (label, fn) => {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.log(`  FAIL ${label} — ${error.message}`);
  }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
const eq = (actual, expected, what = '') =>
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${what ? what + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const { mod, fonts } = await loadPdfHarness('sample-platforms');
const seed = mod.seed.SEEDS.find((s) => s.id === 'water-quality');
const exported = await mod.exportPdf.exportPdf(mod.seed.buildSeedDocument(seed.content), { title: seed.title, header: seed.content.header, footer: seed.content.footer }, fonts);
if (!exported.ok) throw new Error('the seed document did not export');
const ORIGINAL = exported.bytes;
const PACKET = await VARIANTS.packet(ORIGINAL);
const SCAN = await scannedPdf();

/* ---------- a local stand-in for a platform ---------- */

const hits = [];
const server = createServer((req, res) => {
  hits.push({ path: req.url, at: Date.now(), ua: req.headers['user-agent'] });
  const send = (status, type, body, headers = {}) => { res.writeHead(status, { 'content-type': type, ...headers }); res.end(body); };
  const path = req.url.split('?')[0];
  if (path === '/robots.txt') return send(200, 'text/plain', 'User-agent: *\nDisallow: /private\nAllow: /private/open\n');
  if (path === '/original.pdf' || path === '/private/open/original.pdf') return send(200, 'application/pdf', Buffer.from(ORIGINAL));
  if (path === '/packet.pdf') return send(200, 'application/pdf', Buffer.from(PACKET));
  if (path === '/big.pdf') return send(200, 'application/pdf', Buffer.alloc(2048, 0x25), { 'content-length': '2048' });
  if (path === '/forbidden') return send(403, 'text/html', 'no');
  if (path === '/check.pdf') return send(200, 'text/html', '<html><title>Just a moment...</title>Verifying your browser</html>');
  return send(404, 'text/plain', 'not found');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;
const quiet = { log: () => {} };

console.log('Platform sampler — politeness');

await check('robots.txt: the longest matching rule wins, and Allow wins a tie', () => {
  const rules = parseRobots('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private\nAllow: /private/open\nDisallow: /*.aspx$\n');
  eq([robotsAllows(rules, '/'), robotsAllows(rules, '/private/x'), robotsAllows(rules, '/private/open/x'), robotsAllows(rules, '/a.aspx'), robotsAllows(rules, '/a.aspx?x=1')], [true, false, true, false, true]);
});

await check('a path robots.txt disallows is never requested', async () => {
  const fetcher = createFetcher({ ...quiet, minIntervalMs: 0 });
  const before = hits.length;
  const denied = await fetcher.getPdf(`${BASE}/private/secret.pdf`);
  assert(!denied.ok && /robots/.test(denied.reason), `expected a robots refusal, got ${JSON.stringify(denied)}`);
  assert(!hits.slice(before).some((h) => h.path.startsWith('/private/secret')), 'the disallowed path was requested');
  const allowed = await fetcher.getPdf(`${BASE}/private/open/original.pdf`);
  assert(allowed.ok, 'an Allow inside a Disallow is fetched');
});

await check('requests to one host are spaced, and name Ada Editor', async () => {
  const fetcher = createFetcher({ ...quiet, minIntervalMs: 300 });
  const before = hits.length;
  await fetcher.getPdf(`${BASE}/original.pdf`);
  await fetcher.getPdf(`${BASE}/packet.pdf`);
  const mine = hits.slice(before);
  for (let i = 1; i < mine.length; i++) assert(mine[i].at - mine[i - 1].at >= 280, `requests ${mine[i].at - mine[i - 1].at} ms apart`);
  assert(mine.every((h) => /Ada Editor/.test(h.ua)), 'User-Agent names Ada Editor');
});

await check('a 403 stops the host for the rest of the run, without another request', async () => {
  const fetcher = createFetcher({ ...quiet, minIntervalMs: 0 });
  const first = await fetcher.getText(`${BASE}/forbidden`);
  assert(!first.ok && first.blocked, 'the 403 is reported as blocked');
  const before = hits.length;
  const next = await fetcher.getPdf(`${BASE}/original.pdf`);
  assert(!next.ok && next.blocked, 'the next request is refused');
  eq(hits.length, before, 'requests made after the block');
});

await check('a browser-check page instead of a PDF stops the host', async () => {
  const fetcher = createFetcher({ ...quiet, minIntervalMs: 0 });
  const r = await fetcher.getPdf(`${BASE}/check.pdf`);
  assert(!r.ok && r.blocked, `expected a block, got ${JSON.stringify(r)}`);
  assert(fetcher.stats().blockedHosts[new URL(BASE).host], 'the host is recorded as stopped');
});

await check('the per-file size cap holds', async () => {
  const fetcher = createFetcher({ ...quiet, minIntervalMs: 0, maxFileBytes: 1024 });
  const r = await fetcher.getPdf(`${BASE}/big.pdf`);
  assert(!r.ok && r.tooLarge, `expected tooLarge, got ${JSON.stringify(r)}`);
});

await check('signed-URL parameters are stripped or redacted before anything is written', () => {
  const url = 'https://x.blob.core.windows.net/c/f.pdf?sv=2024&se=2026-10-12&sp=rw&sig=abc%2Fdef';
  eq(stripQuery(url), 'https://x.blob.core.windows.net/c/f.pdf');
  assert(!/abc|rw|2026-10-12/.test(redact(url)), redact(url));
});

console.log('\nPlatform sampler — packets');

const original = await inspectPdf(ORIGINAL);
await check('a merge that drops the tree is "removed"', async () => {
  eq(comparePacket([original], await inspectPdf(PACKET)).tags, 'removed');
});
await check('a packet that keeps the structure is "kept"', async () => {
  eq(comparePacket([original], await inspectPdf(await VARIANTS.resaved(ORIGINAL))).tags, 'kept');
});
await check('a packet re-tagged as paragraphs is "flattened"', async () => {
  eq(comparePacket([original], await inspectPdf(await VARIANTS.flattened(ORIGINAL))).tags, 'flattened');
});
await check('a packet without the document language is reported', async () => {
  eq(comparePacket([original], await inspectPdf(await VARIANTS.languageDropped(ORIGINAL))).language, 'dropped');
});
await check('with no tagged attachment there is nothing to compare', async () => {
  const scan = await inspectPdf(SCAN);
  eq(comparePacket([scan], await inspectPdf(PACKET)).tags, 'no tagged attachments to compare');
});
await check('page origins: a scan, Word, Word through Acrobat, a server converter, a print driver, an editor behind a platform re-save', async () => {
  eq(pageOrigin(await inspectPdf(SCAN)), 'scan');
  eq(pageOrigin({ pages: 2, scannedPages: 0, creator: 'Microsoft® Word for Microsoft 365', producer: 'Microsoft® Word for Microsoft 365' }), 'office');
  eq(pageOrigin({ pages: 2, scannedPages: 0, creator: 'Acrobat PDFMaker 23 for Word', producer: 'Adobe PDF Library 23.1.96' }), 'office');
  eq(pageOrigin({ pages: 2, scannedPages: 0, creator: null, producer: 'Aspose.PDF for .NET 23.8.0' }), 'converter');
  eq(pageOrigin({ pages: 2, scannedPages: 0, creator: null, producer: 'Microsoft: Print To PDF' }), 'printed');
  eq(pageOrigin({ pages: 2, scannedPages: 0, creator: 'Adobe Acrobat Pro 2020', producer: 'PDFlib PLOP 4.1 (.NET/Win64)/Adobe Acrobat Pro 2020' }), 'pdf editor');
});

console.log('\nPlatform sampler — a town end to end, against the local stand-in');

await check('a sampled row keeps no signature and names the packet "removed"', async () => {
  const signed = (path) => `${BASE}${path}?sv=2024&sp=rw&sig=SECRET-SIGNATURE`;
  const adapter = {
    platform: 'test',
    meetings: async () => ({ ok: true, meetings: [{ id: 'm1', date: new Date().toISOString().slice(0, 10), title: 'Council' }] }),
    files: async () => ({ ok: true, attachments: [{ name: 'Staff report', served: signed('/original.pdf') }], packet: signed('/packet.pdf') }),
  };
  const ctx = { fetcher: createFetcher({ ...quiet, minIntervalMs: 0 }), log: () => {}, sinceDays: 30, maxAttachments: 30 };
  const row = await sampleTenant(adapter, { tenant: 'testtownfl', municipality: 'Test Town' }, ctx);
  const text = JSON.stringify(row);
  assert(!/SECRET-SIGNATURE|sig=|sp=rw/.test(text), 'a signature reached the row');
  eq(row.attachments[0].inspection.tagged, true, 'the attachment was inspected');
  eq(row.packet.verdict.tags, 'removed', 'packet verdict');
});

await check('the summary names platforms, never towns', () => {
  const row = (tenant, municipality, tags) => ({
    platform: 'civicclerk', tenant, municipality, sampledAt: '2026-10-12T00:00:00Z', meeting: { id: '1', date: '2026-10-01' },
    attachments: [{ name: 'Item', served: 'https://x/y.pdf', origin: 'office', inspection: { pages: 3, tagged: true, orphanPages: 0 } }],
    packet: { url: 'https://x/p.pdf', inspection: {}, verdict: { tags, taggedAttachments: 1, language: 'dropped', notMarked: false, builtBy: 'converter' } },
  });
  const md = summarize([row('northvalefl', 'Northvale', 'kept'), row('southportfl', 'Southport', 'removed')]);
  for (const name of ['northvalefl', 'Northvale', 'southportfl', 'Southport', 'https://']) assert(!md.includes(name), `the summary mentions ${name}`);
  assert(/kept 1/.test(md) && /removed 1/.test(md), 'the verdicts are counted');
});

console.log('\nPlatform sampler — adapters against recorded listings');

for (const platform of Object.keys(ADAPTERS)) {
  if (DISABLED[platform]) {
    console.log(`  --   ${platform}: switched off (${DISABLED[platform]})`);
    continue;
  }
  const expectedPath = join(FIXTURES, platform, 'expected.json');
  if (!existsSync(expectedPath)) {
    failures.push(`${platform}: no fixtures (record one town with --record, then trim it into fixtures/ under the made-up town; see fixtures.mjs)`);
    console.log(`  FAIL ${platform} — no recorded fixtures`);
    continue;
  }
  const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
  const adapter = await loadAdapter(platform);
  const ctx = { fetcher: createReplayer(platform), log: () => {} };
  // The repo is public: a real town in fixtures/ undoes the research's labels.
  await check(`${platform}: the fixtures belong to the made-up town`, () => eq(expected.tenant.tenant, 'example', 'tenant'));
  await check(`${platform}: lists the recorded meetings`, async () => {
    const r = await adapter.meetings(ctx, expected.tenant);
    assert(r.ok, r.reason);
    eq(r.meetings.slice(0, 3).map((m) => ({ id: String(m.id), date: m.date })), expected.meetings);
  });
  await check(`${platform}: finds the recorded meeting's attachments and packet`, async () => {
    const r = await adapter.files(ctx, expected.tenant, expected.meeting);
    assert(r.ok, r.reason);
    const got = { attachments: r.attachments.map((a) => ({ name: a.name, served: redact(a.served), ...(a.stored ? { stored: redact(a.stored) } : {}) })), packet: r.packet && redact(r.packet) };
    eq(got, expected.files);
  });
}

server.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
