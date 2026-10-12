/**
 * One adapter per platform, loaded on demand. Each default-exports:
 *
 *   {
 *     platform: 'civicclerk',
 *     needsPacket: true,            // false where only attachments are sampled (Legistar)
 *     // Published meetings, newest first: [{ id, date: 'YYYY-MM-DD', title }]
 *     async meetings(ctx, tenant) -> { ok: true, meetings } | { ok: false, reason, blocked? },
 *     // The meeting's files. `served` is what the public link returns;
 *     // `stored` is the original as uploaded, where the platform exposes it.
 *     async files(ctx, tenant, meeting) -> { ok: true, attachments: [{ name, served, stored? }], packet: url | null } | { ok: false, reason, blocked? },
 *   }
 *
 * ctx.fetcher is the polite fetcher (fetch.mjs): getJson / getText only, PDFs
 * are the runner's job. tenant is a tenants.json entry ({ platform, tenant, ... }).
 * Adapters never log or return anything they shouldn't keep: signed URLs are
 * fine to return (the runner strips query strings before writing), but
 * nothing else from a response is persisted.
 */
// Not here, because each one turns automated research away and we don't work
// around that (checked 2026-10-12):
//   - Diligent Community (civicweb.net): robots.txt disallows every crawler but
//     named search engines.
//   - Municode Meetings: the load balancer in front of every tenant drops the
//     connection for our User-Agent (the PDFs themselves, on Azure, are served).
//   - eSCRIBE and BoardDocs: scripted downloads get a browser check or a 403.
// An adapter comes back if the vendor allows it.
export const ADAPTERS = {
  civicclerk: () => import('./civicclerk.mjs'),
  legistar: () => import('./legistar.mjs'),
  primegov: () => import('./primegov.mjs'),
};

/**
 * Adapters written but switched off, with the reason. PrimeGov's parser was
 * checked against the October research's captures, but its tenants' robots.txt
 * disallows everything (Oviedo and Boulder, 2026-10-12), so it can't run.
 */
export const DISABLED = {
  primegov: 'robots.txt on PrimeGov tenants disallows all crawlers (checked 2026-10-12)',
};

export const loadAdapter = async (platform) => (ADAPTERS[platform] && !DISABLED[platform] ? (await ADAPTERS[platform]()).default : null);
