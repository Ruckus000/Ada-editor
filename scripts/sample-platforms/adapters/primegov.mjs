/**
 * PrimeGov / OneMeeting (Granicus). Each tenant has a public portal at
 * https://{tenant}.primegov.com:
 *   - /api/v2/PublicPortal/ListArchivedMeetings?year=YYYY and
 *     /api/v2/PublicPortal/ListUpcomingMeetings: meetings, each with a
 *     documentList of published outputs ({ templateId, templateName,
 *     compileOutputType: 3 = HTML, 1 = PDF }). Names vary by tenant ("HTML
 *     Agenda", "Agenda", "Packet", "HTML Packet", "Minutes").
 *   - /Portal/Meeting?meetingTemplateId={HTML templateId}: the HTML agenda.
 *     Items are .meeting-item divs (data-itemid, data-hasattachments) whose
 *     attachments are links to
 *     /api/compilemeetingattachmenthistory/historyattachment/?historyId={guid},
 *     the served copy (no original is exposed). Section-level attachments are
 *     loaded by script (/meetings/sectionattachment) and not sampled.
 *   - /Public/CompiledDocument?meetingTemplateId={Packet templateId}&compileOutputType=1:
 *     the PDF packet, a 302 to a pre-compiled file on Azure blob storage.
 * Many tenants' robots.txt disallows everything; the fetcher honours that,
 * and meetings() then reports it as the reason.
 */

const HTML = 3;
const PDF = 1;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const origin = (tenant) => `https://${tenant.tenant}.primegov.com`;

/** 'YYYY-MM-DD' from dateTime ('2026-10-05T18:30:00', local) or date ('Oct 05, 2026'). */
function isoDate(m) {
  if (/^\d{4}-\d{2}-\d{2}/.test(m.dateTime ?? '')) return m.dateTime.slice(0, 10);
  const d = /^([A-Za-z]{3})\w*\s+(\d{1,2}),\s*(\d{4})/.exec(m.date ?? '');
  const month = d && MONTHS[d[1].toLowerCase()];
  return month ? `${d[3]}-${String(month).padStart(2, '0')}-${d[2].padStart(2, '0')}` : null;
}

const isPacket = (doc) => /packet/i.test(doc.templateName ?? '');
const htmlAgenda = (docs) => docs.find((d) => d.compileOutputType === HTML && !isPacket(d)) ?? docs.find((d) => d.compileOutputType === HTML);
const pdfPacket = (docs) => docs.find((d) => d.compileOutputType === PDF && isPacket(d));

const decode = (text) => text
  .replace(/&nbsp;/gi, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');
const clean = (html) => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Attachment download links on an HTML agenda page, deduplicated by historyId. */
export function parseAttachments(html, base) {
  const out = [];
  const seen = new Set();
  const link = /<a\b([^>]*?)\bhref\s*=\s*(["'])([^"']*\/api\/compilemeetingattachmenthistory\/historyattachment\/?\?[^"']*)\2([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(link)) {
    let url;
    try { url = new URL(decode(m[3]), base); } catch { continue; }
    const id = url.searchParams.get('historyId');
    if (!id || !GUID.test(id) || seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());
    const title = /\btitle\s*=\s*(["'])([^"']*)\1/i.exec(m[1] + m[4])?.[2];
    const name = clean(m[5]) || (title ? clean(title).replace(/^Download\s+/i, '') : '') || id;
    out.push({ name, served: url.href });
  }
  return out;
}

async function listing(ctx, url) {
  const r = await ctx.fetcher.getJson(url);
  if (!r.ok) return r;
  if (!Array.isArray(r.json)) return { ok: false, reason: `unexpected meeting listing at ${url.split('?')[0]}` };
  return { ok: true, list: r.json };
}

export default {
  platform: 'primegov',
  needsPacket: true,

  async meetings(ctx, tenant) {
    const base = origin(tenant);
    const now = new Date();
    const year = now.getUTCFullYear();
    // The runner looks back ~120 days: early in the year that reaches into last year's archive.
    const years = now.getUTCMonth() < 5 ? [year, year - 1] : [year];
    const raw = [];
    for (const y of years) {
      const r = await listing(ctx, `${base}/api/v2/PublicPortal/ListArchivedMeetings?year=${y}`);
      if (!r.ok) return { ok: false, reason: r.reason, blocked: r.blocked };
      raw.push(...r.list);
    }
    // Today's meeting may still be listed as upcoming; a failure here isn't fatal.
    const upcoming = await listing(ctx, `${base}/api/v2/PublicPortal/ListUpcomingMeetings`);
    if (upcoming.ok) raw.push(...upcoming.list);
    else if (upcoming.blocked) return { ok: false, reason: upcoming.reason, blocked: true };

    const byId = new Map();
    for (const m of raw) {
      const date = isoDate(m);
      const documents = (m.documentList ?? [])
        .filter((d) => d.templateId != null)
        .map((d) => ({ templateId: d.templateId, templateName: d.templateName, compileOutputType: d.compileOutputType }));
      if (!date || m.id == null || byId.has(m.id)) continue;
      if (!pdfPacket(documents) && !htmlAgenda(documents)) continue;
      byId.set(m.id, { id: m.id, date, dateTime: m.dateTime ?? date, title: m.title ?? '', documents });
    }
    const meetings = [...byId.values()]
      .sort((a, b) => b.dateTime.localeCompare(a.dateTime))
      .map(({ dateTime, ...m }) => m);
    return { ok: true, meetings };
  },

  async files(ctx, tenant, meeting) {
    const base = origin(tenant);
    const docs = meeting.documents ?? [];
    const packetDoc = pdfPacket(docs);
    const packet = packetDoc ? `${base}/Public/CompiledDocument?meetingTemplateId=${packetDoc.templateId}&compileOutputType=${PDF}` : null;
    const agenda = htmlAgenda(docs);
    if (!agenda) return { ok: true, attachments: [], packet };
    const r = await ctx.fetcher.getText(`${base}/Portal/Meeting?meetingTemplateId=${agenda.templateId}`);
    if (!r.ok) return { ok: false, reason: r.reason, blocked: r.blocked };
    return { ok: true, attachments: parseAttachments(r.text, r.finalUrl || base), packet };
  },
};
