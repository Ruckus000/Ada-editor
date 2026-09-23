'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button, Glyph, OPEN_SEVERITIES, SEVERITY_ENCODING, SEVERITY_RANK, SeverityBadge, useAnnounce } from '../../design-system/primitives';
import type { OpenSeverity } from '../../design-system/primitives';
import { CRITERIA, MANUAL_ITEMS } from '../_data/seed';
import type { DocSummary } from '../_data/seed';
import { loadDocSummaries, seedIfEmpty } from '../_data/store';
import './dashboard.css';

type SortKey = 'urgency' | 'recent' | 'name';
type SeverityFilter = OpenSeverity | 'all';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'urgency', label: 'Urgency' },
  { key: 'recent', label: 'Recent' },
  { key: 'name', label: 'A–Z' },
];

/** Summary wording from patterns-suggestion.md, Layer 3: a count, not a verdict. */
const SUMMARY_WORDS: Record<OpenSeverity, string> = {
  blocker: 'blocking',
  violation: 'failing AA',
  advisory: 'advisory',
  manual: 'need your review',
};

const MANUAL_PREVIEW = 3;

const total = (d: DocSummary) => OPEN_SEVERITIES.reduce((sum, s) => sum + (d.counts[s] ?? 0), 0);
const worst = (d: DocSummary): OpenSeverity | null => OPEN_SEVERITIES.find((s) => (d.counts[s] ?? 0) > 0) ?? null;
const present = (counts: DocSummary['counts']) => OPEN_SEVERITIES.filter((s) => (counts[s] ?? 0) > 0);
const breakdown = (d: DocSummary) => present(d.counts).map((s) => `${d.counts[s]} ${SUMMARY_WORDS[s]}`).join(', ');

function matching(all: DocSummary[], query: string, severity: SeverityFilter, showPassing: boolean) {
  const q = query.trim().toLowerCase();
  return all.filter((d) => {
    if (!showPassing && total(d) === 0) return false;
    if (severity !== 'all' && !((d.counts[severity] ?? 0) > 0)) return false;
    if (q && ![d.title, d.owner, d.targets.join(' ')].some((field) => field.toLowerCase().includes(q))) return false;
    return true;
  });
}

function SeverityBar({ counts, className }: { counts: DocSummary['counts']; className: string }) {
  return (
    <span className={className} aria-hidden="true">
      {present(counts).map((s) => (
        <span key={s} className="dash-bar__seg" data-severity={s} style={{ flexGrow: counts[s] } as CSSProperties} />
      ))}
    </span>
  );
}

export function Dashboard({
  density = 'comfortable',
  showPassing = true,
}: {
  density?: 'comfortable' | 'compact';
  showPassing?: boolean;
}) {
  const announce = useAnnounce();
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('urgency');
  const searchRef = useRef<HTMLInputElement>(null);

  // Documents live in localStorage with counts computed by the real engine
  // (§3): the queue is loaded after hydration, so the server render shows the
  // empty-queue state and there is no hand-authored data to drift.
  const [allDocs, setAllDocs] = useState<DocSummary[]>([]);
  useEffect(() => {
    seedIfEmpty();
    setAllDocs(loadDocSummaries());
  }, []);

  const docs = useMemo(() => {
    const list = matching(allDocs, query, severity, showPassing);
    const rank = (d: DocSummary) => {
      const w = worst(d);
      return w ? SEVERITY_RANK[w] : SEVERITY_RANK.checked;
    };
    if (sort === 'urgency') return [...list].sort((a, b) => rank(a) - rank(b) || total(b) - total(a));
    if (sort === 'recent') return [...list].sort((a, b) => a.order - b.order);
    return [...list].sort((a, b) => a.title.localeCompare(b.title));
  }, [allDocs, query, severity, sort, showPassing]);

  // Announce search results once typing pauses, not on every keystroke: a
  // screen reader user hears one result count instead of a stream of them.
  // The count is read when the timer fires, so a filter change mid-pause is included.
  const countRef = useRef(docs.length);
  countRef.current = docs.length;
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const q = query.trim();
    if (!q) return;
    const timer = setTimeout(() => {
      const n = countRef.current;
      announce(`${n} document${n === 1 ? ' matches' : 's match'} “${q}”.`);
    }, 500);
    return () => clearTimeout(timer);
    // Only the query drives this announcement; filter changes announce themselves.
  }, [query]);

  const counts = useMemo(() => {
    const out = {} as Record<OpenSeverity, number>;
    for (const s of OPEN_SEVERITIES) out[s] = allDocs.reduce((sum, d) => sum + (d.counts[s] ?? 0), 0);
    return out;
  }, [allDocs]);
  const totalOpen = OPEN_SEVERITIES.reduce((sum, s) => sum + counts[s], 0);
  const maxCount = Math.max(...OPEN_SEVERITIES.map((s) => counts[s]), 1);
  const docsWithFindings = allDocs.filter((d) => total(d) > 0).length;
  const blockerDocs = allDocs.filter((d) => (d.counts.blocker ?? 0) > 0).length;
  const noFindingDocs = allDocs.length - docsWithFindings;

  const q = query.trim();
  const sevWords = severity === 'all' ? '' : ` with ${SEVERITY_ENCODING[severity].label.toLowerCase()} findings`;
  const hasFilter = severity !== 'all' || q.length > 0;
  const filterLabel = `Showing documents${sevWords}${q ? ` matching “${q}”` : ''}`;

  const toggleSeverity = (s: OpenSeverity) => {
    const next = severity === s ? 'all' : s;
    setSeverity(next);
    announce(next === 'all' ? 'Showing all documents.' : `Filtered to documents with ${SEVERITY_ENCODING[next].label.toLowerCase()} findings.`);
  };

  const clearFilter = () => {
    setSeverity('all');
    setQuery('');
    announce('Filters cleared. Showing all documents.');
  };

  const clearQuery = () => {
    setQuery('');
    announce('Search cleared.');
    searchRef.current?.focus();
  };

  const notYet = (what: string) => () => announce(`${what} is not available in this prototype yet.`);

  return (
    <div className="dash" data-density={density}>
      <header className="dash-header">
        <div className="dash-brand">
          <span className="dash-brand__mark" aria-hidden="true">A</span>
          <span className="dash-brand__name">Ada Editor</span>
        </div>
        <div className="dash-header__rule" aria-hidden="true" />
        <div className="dash-header__title">
          <h1>Remediation overview</h1>
          <p>{`${totalOpen} open findings across ${docsWithFindings} documents · last full scan ${allDocs[0]?.lastChecked ?? '—'}`}</p>
        </div>
        <div className="dash-header__actions">
          <label className="dash-search">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5 14 14" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              placeholder="Search documents"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search documents, owners and conformance targets"
            />
            {query ? (
              <button type="button" className="dash-search__clear" onClick={clearQuery} aria-label="Clear search">
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5" />
                </svg>
              </button>
            ) : null}
          </label>
          <Button variant="secondary" onClick={notYet('Re-running checks')}>Re-run checks</Button>
          <Button variant="primary" onClick={notYet('Creating a document')}>New document</Button>
          <span className="dash-avatar" aria-hidden="true">JD</span>
        </div>
      </header>

      <main className="dash-main">
        <section aria-label="Queue at a glance" className="dash-stats">
          <div className="dash-stat">
            <span className="dash-stat__label">Open findings</span>
            <span className="dash-stat__value">{totalOpen}</span>
            <SeverityBar counts={counts} className="dash-bar dash-bar--stat" />
            <span className="dash-stat__sub">{`across ${docsWithFindings} of ${allDocs.length} documents`}</span>
          </div>
          <div className="dash-stat">
            <span className="dash-stat__label">Blocking publication</span>
            <span className="dash-stat__value" data-severity="blocker">{counts.blocker}</span>
            <span className="dash-stat__sub">{`${blockerDocs} document${blockerDocs === 1 ? '' : 's'} cannot ship until these are resolved`}</span>
          </div>
          <div className="dash-stat">
            <span className="dash-stat__label">Needs your call</span>
            <span className="dash-stat__value" data-severity="manual">{counts.manual}</span>
            <span className="dash-stat__sub">No automated fix — a person decides</span>
          </div>
          {/* Deliberately neutral: an empty findings list is not a compliance
              verdict (conventions: never show a green "compliant" state). */}
          <div className="dash-stat">
            <span className="dash-stat__label">No open findings</span>
            <span className="dash-stat__value">{noFindingDocs}</span>
            <span className="dash-stat__sub">Nothing flagged by automated checks — still needs a human read</span>
          </div>
        </section>

        <div className="dash-columns">
          <section aria-labelledby="queue-heading" className="dash-panel dash-queue">
            <div className="dash-queue__bar">
              <h2 id="queue-heading">Remediation queue</h2>
              <span className="dash-muted">{`${docs.length} of ${allDocs.length} documents`}</span>
              {/* Native buttons with aria-pressed: <Button> has no pressed or
                  segmented styling, and these are toggles, not actions. */}
              <div role="group" aria-label="Sort queue" className="dash-segmented">
                {SORTS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    aria-pressed={sort === o.key}
                    onClick={() => { setSort(o.key); announce(`Queue sorted by ${o.label === 'A–Z' ? 'name' : o.label.toLowerCase()}.`); }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {hasFilter ? (
              <div className="dash-filterbar">
                <span>{filterLabel}</span>
                <button type="button" onClick={clearFilter}>Clear all</button>
              </div>
            ) : null}

            <div className="dash-cols" aria-hidden="true">
              <span>Document</span>
              <span>Findings</span>
              <span>Owner</span>
              <span>Last checked</span>
              <span />
            </div>

            {/* role="list" restores list semantics that Safari drops with list-style: none. */}
            <ul role="list" aria-label="Documents awaiting remediation" className="dash-rows">
              {docs.map((d) => {
                const open = total(d);
                const w = worst(d);
                return (
                  <li key={d.id}>
                    <Link
                      href={`/editor/${d.id}`}
                      className="dash-row"
                      aria-label={`${d.title}. ${open === 0 ? 'No open findings' : `${open} open findings: ${breakdown(d)}`}. Owner ${d.owner}. Last checked ${d.lastChecked}. Open in editor.`}
                    >
                      <span className="dash-row__doc">
                        <span className="dash-row__title" title={d.title}>{d.title}</span>
                        <span className="dash-chips">
                          {d.targets.map((t) => <span key={t} className="dash-chip">{t}</span>)}
                        </span>
                      </span>
                      <span className="dash-row__findings" aria-hidden="true">
                        {w ? <SeverityBadge severity={w} /> : <span className="dash-row__none">No open findings</span>}
                        {open > 0 ? (
                          <span className="dash-row__meter">
                            <SeverityBar counts={d.counts} className="dash-bar dash-bar--row" />
                            <span>{`${open} open`}</span>
                          </span>
                        ) : null}
                      </span>
                      <span className="dash-row__owner" aria-hidden="true" title={d.owner}>{d.owner}</span>
                      <span className="dash-row__checked" aria-hidden="true">{d.lastChecked}</span>
                      <span className="dash-row__chevron" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 3 5 5-5 5" /></svg>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {docs.length === 0 ? (
              <div className="dash-empty">
                <p className="dash-empty__title">{q ? 'No documents match that search' : 'Nothing in this view'}</p>
                <p className="dash-empty__body">
                  {q
                    ? `Nothing matches “${q}”${sevWords}. Check the spelling, or search by owner or conformance target.`
                    : `No documents currently have ${severity === 'all' ? 'open' : SEVERITY_ENCODING[severity].label.toLowerCase()} findings.`}
                </p>
                <button type="button" className="dash-empty__action" onClick={clearFilter}>Clear search and filters</button>
              </div>
            ) : null}
          </section>

          <div className="dash-side">
            <section aria-labelledby="sev-heading" className="dash-panel dash-card">
              <h2 id="sev-heading">Findings by severity</h2>
              <p className="dash-card__intro">Select a severity to filter the queue.</p>
              <div className="dash-sevrows">
                {OPEN_SEVERITIES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="dash-sevrow"
                    aria-pressed={severity === s}
                    disabled={counts[s] === 0}
                    onClick={() => toggleSeverity(s)}
                  >
                    <span className="dash-sevrow__line">
                      <span className="dash-sevrow__glyph" data-severity={s}><Glyph severity={s} /></span>
                      <span className="dash-sevrow__label">{SEVERITY_ENCODING[s].label}</span>
                      <span className="dash-sevrow__count">{counts[s]}</span>
                    </span>
                    <span className="dash-sevrow__track" aria-hidden="true">
                      <span className="dash-sevrow__fill" data-severity={s} style={{ width: `${Math.round((counts[s] / maxCount) * 100)}%` }} />
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section aria-labelledby="manual-heading" className="dash-panel dash-card">
              <h2 id="manual-heading">Waiting on a human</h2>
              <p className="dash-card__intro">Checks the engine cannot decide for you.</p>
              <ul role="list" className="dash-manual">
                {MANUAL_ITEMS.slice(0, MANUAL_PREVIEW).map((item) => (
                  <li key={item.question}>
                    <span className="dash-manual__q">{item.question}</span>
                    <span className="dash-manual__doc">{allDocs.find((d) => d.id === item.docId)?.title}</span>
                  </li>
                ))}
              </ul>
              {MANUAL_ITEMS.length > MANUAL_PREVIEW ? (
                <Link className="dash-link" href={`/editor/${MANUAL_ITEMS[MANUAL_PREVIEW]!.docId}`}>
                  {`${MANUAL_ITEMS.length - MANUAL_PREVIEW} more waiting on a decision`}
                </Link>
              ) : null}
            </section>

            <section aria-labelledby="criteria-heading" className="dash-panel dash-card">
              <h2 id="criteria-heading">Most-failed criteria</h2>
              <ul role="list" className="dash-criteria">
                {CRITERIA.map((c) => (
                  <li key={c.id}>
                    <span className="dash-criteria__id">{c.id}</span>
                    <span className="dash-criteria__name">{c.name}</span>
                    <span className="dash-criteria__count">{c.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
