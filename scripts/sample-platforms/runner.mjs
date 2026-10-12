/**
 * One town at a time: its latest usable meeting, every attachment and the
 * packet downloaded, inspected and thrown away. Only the inspection is kept,
 * and every URL in it has its query string stripped (some platforms sign their
 * links). Used by index.mjs; the gate runs it against a local server.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { comparePacket, comparePdfs, inspectPdf, pageOrigin } from '../posted-pdf.mjs';
import { validatePdfUa } from '../verapdf.mjs';
import { stripQuery } from './fetch.mjs';
import { FIXTURES, redact } from './fixtures.mjs';

const SUMMARY_FIELDS = ['pages', 'producer', 'creator', 'tagged', 'marked', 'elements', 'groups', 'figuresWithAlt', 'lang', 'rootLang', 'title', 'displayDocTitle', 'pdfua', 'bookmarks', 'orphanPages', 'scannedPages'];
const brief = (inspection) => Object.fromEntries(SUMMARY_FIELDS.map((k) => [k, inspection[k]]));

async function inspect(fetcher, url, keep) {
  const r = await fetcher.getPdf(url);
  if (!r.ok) return { error: r.reason, blocked: r.blocked };
  try {
    const inspection = await inspectPdf(r.bytes);
    if (!keep) return { inspection };
    const file = join(keep.dir, `${keep.files.length}.pdf`);
    writeFileSync(file, r.bytes);
    keep.files.push(file);
    return { inspection, file };
  } catch (error) {
    return { error: `not readable: ${error.message}` };
  }
}

/** One town: its latest usable meeting, every attachment and the packet inspected. */
export async function sampleTenant(adapter, tenant, ctx) {
  const row = { platform: adapter.platform, tenant: tenant.tenant, municipality: tenant.municipality, sampledAt: new Date().toISOString(), errors: [] };
  const since = new Date(Date.now() - ctx.sinceDays * 864e5).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const listed = await adapter.meetings(ctx, tenant);
  if (!listed.ok) return { ...row, errors: [listed.reason], blocked: listed.blocked };
  const candidates = listed.meetings.filter((m) => m.date >= since && m.date <= today).slice(0, 4);
  if (!candidates.length) return { ...row, errors: [`no published meeting since ${since}`] };
  // The packet is fetched first: a meeting whose packet is over the size cap
  // is passed over for the next one, before any attachment is downloaded.
  const keep = ctx.vera && !ctx.dryRun ? { dir: mkdtempSync(join(tmpdir(), 'ada-sample-')), files: [] } : null;
  let chosen = null;
  for (const meeting of candidates) {
    const files = await adapter.files(ctx, tenant, meeting);
    if (!files.ok) { row.errors.push(files.reason); if (files.blocked) return { ...row, blocked: true }; continue; }
    if (!(adapter.needsPacket === false ? files.attachments.length : files.packet)) continue;
    let packet = null;
    if (files.packet && !ctx.dryRun) {
      packet = await inspect(ctx.fetcher, files.packet, keep);
      if (packet.error && !packet.blocked && adapter.needsPacket !== false) { row.errors.push(`${meeting.date}: packet skipped, ${packet.error}`); continue; }
    }
    chosen = { meeting, files, packet };
    break;
  }
  if (!chosen) {
    if (keep) rmSync(keep.dir, { recursive: true, force: true });
    return { ...row, errors: [...row.errors, 'no recent meeting with the files this platform is sampled for'] };
  }
  const { meeting, files, packet } = chosen;
  row.meeting = { id: String(meeting.id), date: meeting.date };
  if (ctx.record) {
    // What the offline gate expects the adapter to make of the recorded listings.
    const expected = {
      tenant,
      meetings: listed.meetings.slice(0, 3).map((m) => ({ id: String(m.id), date: m.date })),
      meeting,
      files: { attachments: files.attachments.map((a) => ({ name: a.name, served: redact(a.served), ...(a.stored ? { stored: redact(a.stored) } : {}) })), packet: files.packet && redact(files.packet) },
    };
    writeFileSync(join(FIXTURES, adapter.platform, 'expected.json'), JSON.stringify(expected, null, 2) + '\n');
  }
  if (ctx.dryRun) {
    row.dryRun = { attachments: files.attachments.map((a) => ({ name: a.name, served: stripQuery(a.served), stored: a.stored && stripQuery(a.stored) })), packet: files.packet && stripQuery(files.packet) };
    return row;
  }
  row.attachments = [];
  for (const attachment of files.attachments.slice(0, ctx.maxAttachments)) {
    const served = await inspect(ctx.fetcher, attachment.served, keep);
    const entry = { name: attachment.name, served: stripQuery(attachment.served) };
    if (served.error) { entry.error = served.error; row.attachments.push(entry); if (served.blocked) break; continue; }
    entry.inspection = brief(served.inspection);
    entry.origin = pageOrigin(served.inspection);
    entry.servedFile = served.file;
    entry._full = served.inspection;
    if (attachment.stored && stripQuery(attachment.stored) !== stripQuery(attachment.served)) {
      const stored = await inspect(ctx.fetcher, attachment.stored, keep);
      if (stored.error) entry.storedError = stored.error;
      else {
        entry.stored = { inspection: brief(stored.inspection), origin: pageOrigin(stored.inspection), file: stored.file };
        entry.attachmentPath = comparePdfs(stored.inspection, served.inspection);
      }
    }
    row.attachments.push(entry);
  }
  if (files.attachments.length > ctx.maxAttachments) row.attachmentsSkipped = files.attachments.length - ctx.maxAttachments;
  if (packet) {
    if (packet.error) row.packet = { url: stripQuery(files.packet), error: packet.error };
    else {
      row.packet = {
        url: stripQuery(files.packet),
        inspection: brief(packet.inspection),
        verdict: comparePacket(row.attachments.filter((a) => a._full).map((a) => a._full), packet.inspection),
        file: packet.file,
      };
    }
  }
  if (keep) {
    const paths = keep.files;
    if (paths.length) {
      const { results, error } = validatePdfUa(paths);
      if (error) row.errors.push(error);
      const failed = (path) => results.get(path)?.failed ?? null;
      for (const a of row.attachments) {
        if (a.servedFile) a.veraFailed = failed(a.servedFile);
        if (a.stored?.file) a.stored.veraFailed = failed(a.stored.file);
        if (a.attachmentPath && a.stored?.veraFailed && a.veraFailed) a.attachmentPath.newFailures = a.veraFailed.filter((id) => !a.stored.veraFailed.includes(id));
      }
      if (row.packet?.file) row.packet.veraFailed = failed(row.packet.file);
    }
    rmSync(keep.dir, { recursive: true, force: true });
  }
  for (const a of row.attachments) { delete a._full; delete a.servedFile; if (a.stored) delete a.stored.file; }
  if (row.packet) delete row.packet.file;
  return row;
}

