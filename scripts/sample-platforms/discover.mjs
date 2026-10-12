/**
 * Which Florida towns use which agenda platform, found without probing the
 * vendors: the Wayback Machine's index (CDX API) lists the hostnames it has
 * archived under each platform's domain, and each tenant is matched to a
 * Florida municipality (fl-municipalities.json) by name or by a state suffix
 * in the hostname. crt.sh would be the usual source, but its robots.txt
 * disallows crawling. Legistar's index is too large for the Wayback Machine to
 * scan, so Legistar clients are confirmed through its official Web API instead
 * (no robots.txt; built for programmatic use), for Florida municipalities of
 * 25,000 people or more: Legistar is a larger-city product. The result is a candidate list to review by hand:
 * tenants.json is only written with --write, and keeps any entry already
 * marked by hand (exclude, note).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFetcher } from './fetch.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Each platform's domain, how a hostname names its tenant, and the pages worth asking the index for. */
export const PLATFORM_HOSTS = {
  civicclerk: { domain: 'civicclerk.com', tenant: /^([a-z0-9-]+)\.(?:api|portal)\.civicclerk\.com$/, root: '(?:Events|portal|$)' },
  municode: { domain: 'municodemeetings.com', tenant: /^([a-z0-9-]+)\.municodemeetings\.com$/, root: '' },
  primegov: { domain: 'primegov.com', tenant: /^([a-z0-9-]+)\.primegov\.com$/, root: '(?:public/portal|Portal|$)' },
};

const squash = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const VENDOR_HOSTS = /^(www|api|portal|demo|support|help|status|training|test|sandbox|uat|staging|cdn|static|mail|info|blog)$/;

/** The Florida municipality a tenant name points to, and how it was matched. */
export function matchFlorida(tenant, municipalities) {
  const t = squash(tenant);
  if (VENDOR_HOSTS.test(t)) return null;
  const stem = t.replace(/^(cityof|townof|villageof|my|the)/, '').replace(/(fl|florida)$/, '').replace(/(city|town|village|gov)$/, '');
  const stateSuffix = /(-fl|fl)$/.test(tenant.toLowerCase());
  for (const m of municipalities) {
    const name = squash(m.name);
    if (stem === name || t === name) return { municipality: m.name, county: m.county, population: m.population, match: stateSuffix ? 'name + FL suffix' : 'name only' };
  }
  return null;
}

const LEGISTAR_MIN_POPULATION = 25000;

/** Legistar clients among larger Florida municipalities, one Web API request per guessed client name. */
async function legistarClients(fetcher, municipalities, log) {
  const found = [];
  const larger = municipalities.filter((m) => (m.population ?? 0) >= LEGISTAR_MIN_POPULATION);
  log(`legistar: checking ${larger.length} Florida municipalities of ${LEGISTAR_MIN_POPULATION.toLocaleString('en-US')}+ people against the Web API`);
  for (const m of larger) {
    for (const client of [squash(m.name), `cityof${squash(m.name)}`]) {
      const r = await fetcher.getJson(`https://webapi.legistar.com/v1/${client}/bodies?$top=1`);
      if (r.blocked) return { ok: false, reason: r.reason, found };
      if (r.ok && Array.isArray(r.json)) {
        found.push({ platform: 'legistar', tenant: client, municipality: m.name, county: m.county, population: m.population, match: 'Web API client', source: 'Legistar Web API' });
        break;
      }
    }
  }
  return { ok: true, found };
}

async function hostsFor(fetcher, platform) {
  const { domain, root } = PLATFORM_HOSTS[platform];
  const filter = encodeURIComponent(`original:https?://[^/]+/?${root}`);
  const url = `https://web.archive.org/cdx/search/cdx?url=${domain}&matchType=domain&fl=original&collapse=urlkey&filter=${filter}&limit=200000`;
  const r = await fetcher.getText(url);
  if (!r.ok) return { ok: false, reason: r.reason };
  const hosts = new Set();
  for (const line of r.text.split('\n')) {
    const m = /^https?:\/\/([^/:]+)/i.exec(line.trim());
    if (m) hosts.add(m[1].toLowerCase().replace(/^www\./, ''));
  }
  return { ok: true, hosts: [...hosts] };
}

export async function discover({ log, tenantsPath, apply }) {
  const { municipalities } = JSON.parse(readFileSync(join(HERE, 'fl-municipalities.json'), 'utf8'));
  const existing = existsSync(tenantsPath) ? JSON.parse(readFileSync(tenantsPath, 'utf8')).tenants : [];
  const fetcher = createFetcher({ log, minIntervalMs: 3000 });
  const found = [];
  const only = process.argv.includes('--platform') ? process.argv[process.argv.indexOf('--platform') + 1] : null;
  if (!only || only === 'legistar') {
    const r = await legistarClients(fetcher, municipalities, log);
    found.push(...r.found);
    log(`legistar: ${r.found.length} clients${r.ok ? '' : ` (stopped: ${r.reason})`}`);
  }
  for (const platform of Object.keys(PLATFORM_HOSTS).filter((p) => !only || p === only)) {
    const r = await hostsFor(fetcher, platform);
    if (!r.ok) { log(`${platform}: ${r.reason}`); continue; }
    const tenants = new Set(r.hosts.map((h) => PLATFORM_HOSTS[platform].tenant.exec(h)?.[1]).filter(Boolean));
    let n = 0;
    for (const tenant of [...tenants].sort()) {
      const match = matchFlorida(tenant, municipalities);
      if (!match) continue;
      n++;
      found.push({ platform, tenant, ...match, source: 'Wayback CDX' });
    }
    log(`${platform}: ${r.hosts.length} hosts in the index, ${n} matched to a Florida municipality`);
  }
  const key = (t) => `${t.platform}/${t.tenant}`;
  const kept = new Map(existing.map((t) => [key(t), t]));
  for (const t of found) if (!kept.has(key(t))) kept.set(key(t), t);
  const tenants = [...kept.values()].sort((a, b) => key(a).localeCompare(key(b)));
  if (apply) {
    writeFileSync(tenantsPath, JSON.stringify({
      note: 'Which Florida towns use which agenda platform: public information (vendors publish their customers). Candidates from `npm run sample-platforms -- discover --write`, reviewed by hand; "exclude" keeps a tenant out of sampling. Nothing about how any town performed is recorded here.',
      tenants,
    }, null, 2) + '\n');
    log(`\nWrote ${tenants.length} tenants to ${tenantsPath}`);
  } else {
    for (const t of found) log(`  ${t.platform.padEnd(11)} ${t.tenant.padEnd(28)} ${t.municipality} (${t.match})`);
    log(`\n${found.length} candidates. Rerun with --write to save them to tenants.json for review.`);
  }
}
