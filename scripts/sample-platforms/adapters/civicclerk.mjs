/**
 * CivicClerk. Each town has a public OData API at https://{tenant}.api.civicclerk.com:
 *   - /v1/Events?$top&$skip&$orderby&$filter: meetings, newest first. Future
 *     meetings come first and often have an agenda id but nothing published
 *     yet; a meeting counts once its publishedFiles list an Agenda or Agenda
 *     Packet. startDateTime is UTC, so the meeting's date is taken in the
 *     town's time zone (Eastern unless tenants.json says otherwise).
 *   - /v1/Meetings/{agendaId}: the agenda's items, nested in childItems, each
 *     with an attachmentsList. pdfVersionFullPath is the PDF the portal serves:
 *     a signed Azure blob URL that, for an uploaded PDF, is the upload itself,
 *     and for an Office upload is CivicClerk's own conversion. So there is no
 *     separate `stored` file to compare.
 *   - /v1/Meetings/GetMeetingFileStream(fileId=…,plainText=false): a published
 *     file, here the "Agenda Packet" the platform compiles.
 * The OData service rejects $select and lambda filters on publishedFiles
 * (HTTP 500), hence the unfiltered pages. Signed URLs are only returned to the
 * runner, never logged or kept on the meeting object.
 */
const PAGE = 50;
const MAX_PAGES = 3;

const api = (tenant) => `https://${tenant.tenant}.api.civicclerk.com`;
const eventsUrl = (tenant, skip) => `${api(tenant)}/v1/Events?$top=${PAGE}&$skip=${skip}&$orderby=startDateTime%20desc&$filter=agendaId%20gt%200`;
const packetUrl = (tenant, fileId) => `${api(tenant)}/v1/Meetings/GetMeetingFileStream(fileId=${fileId},plainText=false)`;

/** 'YYYY-MM-DD' of a UTC timestamp in the given zone. */
const localDate = (iso, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

const fileOfType = (files, type) => (files ?? []).find((f) => f?.type === type && f.fileId);

/** Every attachment in an item tree, depth first, in agenda order. */
function* attachmentsOf(items) {
  for (const item of items ?? []) {
    yield* item.attachmentsList ?? [];
    yield* attachmentsOf(item.childItems);
  }
}

const isPdfUrl = (url) => {
  try { const u = new URL(url); return u.protocol === 'https:' && /\.pdf$/i.test(u.pathname); } catch { return false; }
};

export default {
  platform: 'civicclerk',
  needsPacket: true,

  async meetings(ctx, tenant) {
    const timeZone = tenant.timeZone ?? 'America/New_York';
    const meetings = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const r = await ctx.fetcher.getJson(eventsUrl(tenant, page * PAGE));
      if (!r.ok) return page ? { ok: true, meetings } : { ok: false, reason: r.reason, blocked: r.blocked };
      const events = Array.isArray(r.json?.value) ? r.json.value : null;
      if (!events) return page ? { ok: true, meetings } : { ok: false, reason: 'CivicClerk events listing has no value array' };
      for (const e of events) {
        if (!(e.agendaId > 0) || !e.startDateTime) continue;
        const agenda = fileOfType(e.publishedFiles, 'Agenda');
        const packet = fileOfType(e.publishedFiles, 'Agenda Packet');
        if (!agenda && !packet) continue;
        meetings.push({
          id: e.agendaId,
          date: localDate(e.startDateTime, timeZone),
          title: String(e.eventName ?? '').trim(),
          eventId: e.id,
          packetFileId: packet?.fileId ?? null,
        });
      }
      // Newest first: once a page reaches past meetings, older pages aren't needed.
      if (events.length < PAGE || events.some((e) => e.startDateTime && Date.parse(e.startDateTime) < Date.now())) break;
    }
    return { ok: true, meetings };
  },

  async files(ctx, tenant, meeting) {
    const r = await ctx.fetcher.getJson(`${api(tenant)}/v1/Meetings/${meeting.id}`);
    if (!r.ok) return { ok: false, reason: r.reason, blocked: r.blocked };
    const detail = r.json ?? {};
    const seen = new Set();
    const attachments = [];
    for (const a of attachmentsOf(detail.items)) {
      if (!a || a.isPublished === false || seen.has(a.id)) continue;
      seen.add(a.id);
      if (!isPdfUrl(a.pdfVersionFullPath)) continue;
      attachments.push({ name: String(a.fileName ?? `attachment ${a.id}`).trim(), served: a.pdfVersionFullPath });
    }
    const packetId = meeting.packetFileId ?? fileOfType(detail.publishedFiles, 'Agenda Packet')?.fileId ?? null;
    return { ok: true, attachments, packet: packetId ? packetUrl(tenant, packetId) : null };
  },
};
