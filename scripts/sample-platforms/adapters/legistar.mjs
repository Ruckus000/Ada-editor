/**
 * Granicus Legistar. Sampled for the attachment path only: InSite serves each
 * attachment through View.ashx, re-saved by PDFlib PLOP with its title
 * overwritten, while the Web API names the stored original. No packet was
 * found on sampled Florida meetings, so none is looked for.
 *
 *   meetings: webapi.legistar.com/v1/{client}/events (Final agendas only;
 *             newest events are sometimes Hidden test meetings)
 *   files:    /events/{id}/eventitems?Attachments=1 gives each item's stored
 *             attachments; the served View.ashx links carry different IDs, so
 *             they are paired by name, scraped from the meeting page (item
 *             file numbers) and each item's LegislationDetail page.
 *
 * Requests per town: 2 listings, the meeting page, and up to MAX_ITEMS
 * LegislationDetail pages.
 */
const API = 'https://webapi.legistar.com/v1';
const MAX_ITEMS = 12;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const text = (html) => decode(html.replace(/<[^>]*>/g, ''));
/** Names as compared: dashes, quotes and spacing vary between the API and the page. */
const key = (s) => s.normalize('NFKC').replace(/[‐-―−]/g, '-').replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
const isPdf = (a) => /\.pdf$/i.test(a.MatterAttachmentFileName || a.MatterAttachmentHyperlink || '');

async function meetings(ctx, tenant) {
  const q = new URLSearchParams({ $top: '20', $orderby: 'EventDate desc', $filter: "EventAgendaStatusName eq 'Final'" });
  const r = await ctx.fetcher.getJson(`${API}/${tenant.tenant}/events?${q}`);
  if (!r.ok) return r;
  if (!Array.isArray(r.json)) return { ok: false, reason: 'the events listing was not a list' };
  return {
    ok: true,
    meetings: r.json
      .filter((e) => e.EventId && e.EventDate)
      .map((e) => ({ id: e.EventId, date: String(e.EventDate).slice(0, 10), title: e.EventBodyName, page: e.EventInSiteURL || null })),
  };
}

async function files(ctx, tenant, meeting) {
  if (!meeting.page) return { ok: false, reason: `meeting ${meeting.id} has no public InSite page` };
  const items = await ctx.fetcher.getJson(`${API}/${tenant.tenant}/events/${meeting.id}/eventitems?Attachments=1`);
  if (!items.ok) return items;
  if (!Array.isArray(items.json)) return { ok: false, reason: 'the event items listing was not a list' };

  // Stored PDF attachments by item file number, in agenda order.
  const stored = new Map();
  for (const item of items.json) {
    const pdfs = (item.EventItemMatterAttachments ?? []).filter((a) => a.MatterAttachmentShowOnInternetPage !== false && isPdf(a) && a.MatterAttachmentHyperlink);
    if (item.EventItemMatterFile && pdfs.length && !stored.has(item.EventItemMatterFile)) stored.set(item.EventItemMatterFile, pdfs);
  }
  if (!stored.size) return { ok: true, attachments: [], packet: null };

  const page = await ctx.fetcher.getText(meeting.page);
  if (!page.ok) return page;
  const details = new Map();
  for (const m of page.text.matchAll(/<a\b[^>]*href="(LegislationDetail\.aspx\?[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const file = text(m[2]).trim();
    if (stored.has(file) && !details.has(file)) details.set(file, new URL(decode(m[1]), page.finalUrl).href);
  }

  const attachments = [];
  for (const [file, pdfs] of [...stored].filter(([file]) => details.has(file)).slice(0, MAX_ITEMS)) {
    const detail = await ctx.fetcher.getText(details.get(file));
    if (!detail.ok) { if (detail.blocked) return detail; continue; }
    const served = new Map();
    for (const m of detail.text.matchAll(/<a\b[^>]*href="(View\.ashx\?M=F&(?:amp;)?[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const name = key(text(m[2]));
      if (name && !served.has(name)) served.set(name, new URL(decode(m[1]), detail.finalUrl).href);
    }
    for (const a of pdfs) {
      const link = served.get(key(a.MatterAttachmentName ?? ''));
      if (link) attachments.push({ name: a.MatterAttachmentName, served: link, stored: a.MatterAttachmentHyperlink });
    }
  }
  return { ok: true, attachments, packet: null };
}

export default { platform: 'legistar', needsPacket: false, meetings, files };
