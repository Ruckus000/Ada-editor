/**
 * The one way the sampler (and check-posted-pdf.mjs) downloads anything.
 * Politeness is built in, not optional:
 *   - a User-Agent that names us and a contact page;
 *   - robots.txt read once per host, and its rules for every agent respected;
 *   - one request at a time, spaced per host;
 *   - no retries; the first 401/403/429/503 or browser-check page stops that
 *     host for the rest of the run;
 *   - a size cap per file and per run.
 * Errors come back as values ({ ok: false, reason }) so a batch can carry on.
 */

export const USER_AGENT = 'Ada Editor platform research (+https://www.adaedit.com/research/agenda-platforms#method)';
const BLOCK_STATUSES = new Set([401, 403, 429, 503]);
const DROPPED = /other side closed|ECONNRESET|socket hang up|ENHANCE_YOUR_CALM|empty reply/i;
const MB = 1024 * 1024;

/** A URL with its query string and fragment removed: what's safe to write down. */
export const stripQuery = (url) => {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return String(url).split(/[?#]/)[0];
  }
};

/** robots.txt rules for the * group: [{ allow, pattern }]. */
export function parseRobots(text) {
  const rules = [];
  let inStar = false;
  let sawRule = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === 'user-agent') {
      if (sawRule) { inStar = false; sawRule = false; }
      if (value === '*') inStar = true;
    } else if (field === 'allow' || field === 'disallow') {
      sawRule = true;
      if (inStar && value) rules.push({ allow: field === 'allow', pattern: value });
    }
  }
  return rules;
}

/** Whether robots rules allow a path (with query). Longest matching rule wins; Allow wins ties. */
export function robotsAllows(rules, pathAndQuery) {
  let best = null;
  for (const rule of rules) {
    const re = new RegExp('^' + rule.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (!re.test(pathAndQuery)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule;
  }
  return !best || best.allow;
}

const looksLikeBrowserCheck = (text) => /just a moment|cf-browser-verification|cf-chl|captcha|verifying your browser|attention required/i.test(text);

/**
 * A fetcher for one run. Options are for tests and for the single-file
 * checker; the sampler uses the defaults.
 */
export function createFetcher({
  userAgent = USER_AGENT,
  minIntervalMs = 2000,
  maxFileBytes = 60 * MB,
  maxRunBytes = 3 * 1024 * MB,
  respectRobots = true,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = () => Date.now(),
  log = () => {},
} = {}) {
  const lastRequest = new Map();
  const robots = new Map();
  const blocked = new Map();
  let runBytes = 0;
  let requests = 0;

  async function request(url, accept) {
    let u;
    try { u = new URL(url); } catch { return { ok: false, reason: `not a URL: ${stripQuery(url)}` }; }
    if (!/^https?:$/.test(u.protocol)) return { ok: false, reason: `only http(s) URLs: ${stripQuery(url)}` };
    const host = u.host;
    if (blocked.has(host)) return { ok: false, blocked: true, reason: `${host} stopped earlier in this run (${blocked.get(host)})` };
    if (respectRobots && !robots.has(host)) {
      robots.set(host, []);
      const r = await raw(`${u.origin}/robots.txt`, 'text/plain', host);
      if (r.error && DROPPED.test(r.error)) {
        blocked.set(host, 'connection dropped');
        return { ok: false, blocked: true, reason: `${host} dropped the connection (treated as a block)` };
      }
      if (r.response?.ok) robots.set(host, parseRobots(await r.response.text()));
    }
    if (respectRobots && !robotsAllows(robots.get(host), u.pathname + u.search)) {
      return { ok: false, reason: `robots.txt disallows ${stripQuery(url)}` };
    }
    const r = await raw(url, accept, host);
    if (r.error) {
      // A server that hangs up without answering is turning us away, not failing.
      if (DROPPED.test(r.error)) {
        blocked.set(host, 'connection dropped');
        log(`  stopping ${host}: it dropped the connection`);
        return { ok: false, blocked: true, reason: `${host} dropped the connection (treated as a block) at ${stripQuery(url)}` };
      }
      return { ok: false, reason: `could not reach ${stripQuery(url)}: ${r.error}` };
    }
    const { response } = r;
    if (BLOCK_STATUSES.has(response.status)) {
      blocked.set(host, `HTTP ${response.status}`);
      log(`  stopping ${host}: HTTP ${response.status}`);
      return { ok: false, blocked: true, status: response.status, reason: `blocked (HTTP ${response.status}) at ${stripQuery(url)}` };
    }
    if (!response.ok) return { ok: false, status: response.status, reason: `HTTP ${response.status} for ${stripQuery(url)}` };
    return { ok: true, response, host };
  }

  async function raw(url, accept, host) {
    const wait = (lastRequest.get(host) ?? -Infinity) + minIntervalMs - now();
    if (wait > 0) await sleep(wait);
    lastRequest.set(host, now());
    requests++;
    try {
      return { response: await fetchImpl(url, { redirect: 'follow', headers: { 'User-Agent': userAgent, Accept: accept } }) };
    } catch (error) {
      return { error: error.cause?.message ?? error.message };
    }
  }

  /** The body as text, for listings. Browser-check pages stop the host. */
  async function getText(url) {
    const r = await request(url, 'text/html,application/json;q=0.9,*/*;q=0.8');
    if (!r.ok) return r;
    let text;
    try { text = await r.response.text(); } catch (error) { return { ok: false, reason: `the response broke off at ${stripQuery(url)}: ${error.cause?.message ?? error.message}` }; }
    runBytes += text.length;
    const html = /html/i.test(r.response.headers.get('content-type') ?? '') || /^\s*</.test(text);
    if (html && looksLikeBrowserCheck(text.slice(0, 20000))) {
      blocked.set(r.host, 'browser check');
      return { ok: false, blocked: true, reason: `browser check page at ${stripQuery(url)}` };
    }
    return { ok: true, text, finalUrl: r.response.url || url };
  }

  async function getJson(url) {
    const r = await getText(url);
    if (!r.ok) return r;
    try { return { ok: true, json: JSON.parse(r.text), finalUrl: r.finalUrl }; } catch { return { ok: false, reason: `not JSON at ${stripQuery(url)}` }; }
  }

  /** A PDF's bytes, within the size caps. */
  async function getPdf(url) {
    if (runBytes >= maxRunBytes) return { ok: false, reason: `run limit of ${Math.round(maxRunBytes / MB)} MB reached` };
    const r = await request(url, 'application/pdf,*/*;q=0.8');
    if (!r.ok) return r;
    const { response } = r;
    const declared = Number(response.headers.get('content-length'));
    if (declared > maxFileBytes) {
      response.body?.cancel?.();
      return { ok: false, tooLarge: true, reason: `larger than ${Math.round(maxFileBytes / MB)} MB: ${stripQuery(url)}` };
    }
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > maxFileBytes) {
          return { ok: false, tooLarge: true, reason: `larger than ${Math.round(maxFileBytes / MB)} MB: ${stripQuery(url)}` };
        }
        chunks.push(chunk);
      }
    } catch (error) {
      return { ok: false, reason: `the download broke off at ${stripQuery(url)}: ${error.cause?.message ?? error.message}` };
    }
    runBytes += size;
    const bytes = new Uint8Array(Buffer.concat(chunks));
    if (!Buffer.from(bytes.subarray(0, 1024)).toString('latin1').includes('%PDF-')) {
      const head = Buffer.from(bytes.subarray(0, 4096)).toString('utf8');
      if (looksLikeBrowserCheck(head)) {
        blocked.set(r.host, 'browser check');
        return { ok: false, blocked: true, reason: `browser check page instead of a PDF at ${stripQuery(url)}` };
      }
      return { ok: false, reason: `not a PDF (${response.headers.get('content-type') || 'unknown type'}) at ${stripQuery(url)}` };
    }
    return { ok: true, bytes, finalUrl: response.url || url };
  }

  return {
    getText,
    getJson,
    getPdf,
    stats: () => ({ requests, runBytes, blockedHosts: Object.fromEntries(blocked) }),
  };
}
