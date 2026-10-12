/**
 * Platform-level results from the sampler's local rows, as markdown for the
 * decision record. It names platforms, never towns: the gate checks that no
 * tenant or municipality appears in the output.
 */

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '—');
const count = (list, key) => list.reduce((m, x) => { const k = key(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});
const breakdown = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || '—';

export const PLATFORM_NAMES = {
  civicclerk: 'CivicClerk',
  primegov: 'PrimeGov / OneMeeting',
  municode: 'Municode Meetings',
  legistar: 'Legistar',
};

/** The latest sampled row per town and platform. */
function latest(rows) {
  const by = new Map();
  for (const row of rows) {
    if (!row.meeting || row.dryRun) continue;
    const key = `${row.platform}/${row.tenant}`;
    if (!by.has(key) || by.get(key).sampledAt < row.sampledAt) by.set(key, row);
  }
  return [...by.values()];
}

export function summarize(rows, { platform } = {}) {
  const sampled = latest(rows).filter((r) => !platform || r.platform === platform);
  const platforms = [...new Set(sampled.map((r) => r.platform))].sort();
  const out = [];
  const dates = sampled.map((r) => r.meeting.date).sort();
  out.push(`Sampled ${sampled.length} Florida towns on ${platforms.length} platform(s), meetings from ${dates[0] ?? '—'} to ${dates.at(-1) ?? '—'}. Towns are not named; per-town rows stay local.`);
  out.push('');
  for (const p of platforms) {
    const towns = sampled.filter((r) => r.platform === p);
    const attachments = towns.flatMap((r) => r.attachments ?? []).filter((a) => a.inspection);
    const tagged = attachments.filter((a) => a.inspection.tagged);
    // Served copies that carry page tag links but no tree: stripped on the way out.
    const strippedServed = attachments.filter((a) => !a.inspection.tagged && a.inspection.orphanPages > 0);
    const townsStripping = towns.filter((r) => (r.attachments ?? []).some((a) => a.inspection && !a.inspection.tagged && a.inspection.orphanPages > 0));
    const paths = attachments.filter((a) => a.attachmentPath);
    const pathsTagged = paths.filter((a) => a.stored.inspection.tagged);
    const packets = towns.filter((r) => r.packet?.verdict);
    const comparable = packets.filter((r) => r.packet.verdict.taggedAttachments > 0);
    const pages = count(attachments.flatMap((a) => Array(a.inspection.pages ?? 0).fill(a.origin)), (o) => o);
    const totalPages = Object.values(pages).reduce((a, b) => a + b, 0);

    out.push(`### ${PLATFORM_NAMES[p] ?? p}`);
    out.push('');
    out.push('| Measure | Result |');
    out.push('|---|---|');
    out.push(`| Towns sampled (one meeting each) | ${towns.length} |`);
    out.push(`| Attachments inspected | ${attachments.length}, of which tagged ${tagged.length} (${pct(tagged.length, attachments.length)}) |`);
    out.push(`| Attachment pages by origin (estimate) | ${Object.entries(pages).sort((a, b) => b[1] - a[1]).map(([o, n]) => `${o} ${pct(n, totalPages)}`).join(', ') || '—'} |`);
    if (paths.length) {
      out.push(`| Attachment link vs. stored original | ${paths.length} pairs (${pathsTagged.length} tagged): ${breakdown(count(pathsTagged, (a) => a.attachmentPath.tags))} |`);
      out.push(`| Title on the attachment link | ${breakdown(count(pathsTagged, (a) => a.attachmentPath.title))} |`);
      const withUa = pathsTagged.filter((a) => a.stored.inspection.pdfua);
      if (withUa.length) out.push(`| PDF/UA identifier on the attachment link | ${breakdown(count(withUa, (a) => a.attachmentPath.pdfua))} |`);
    }
    out.push(`| Served attachments with tags stripped (page tag links, no tree) | ${strippedServed.length} in ${townsStripping.length} of ${towns.length} towns |`);
    if (packets.length) {
      out.push(`| Packets inspected | ${packets.length}; with a tagged attachment to compare: ${comparable.length} |`);
      out.push(`| Packet structure vs. its tagged attachments | ${breakdown(count(comparable, (r) => r.packet.verdict.tags))} |`);
      out.push(`| Packet language | ${breakdown(count(comparable, (r) => r.packet.verdict.language))} |`);
      out.push(`| Packet tagged but not marked as tagged | ${comparable.filter((r) => r.packet.verdict.notMarked).length} of ${comparable.length} |`);
      out.push(`| Packet built by (from its Producer) | ${breakdown(count(packets, (r) => r.packet.verdict.builtBy))} |`);
    }
    const vera = towns.filter((r) => r.packet?.veraFailed);
    if (vera.length) out.push(`| Packets passing PDF/UA-1 (veraPDF) | ${vera.filter((r) => r.packet.veraFailed.length === 0).length} of ${vera.length} |`);
    out.push('');
  }
  return out.join('\n');
}
