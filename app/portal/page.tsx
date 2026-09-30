'use client';

import { useEffect, useState } from 'react';
import { Button } from '../../design-system/primitives';
import { DailyChart } from '../_portal/DailyChart';
import { useOperator } from '../_portal/PortalGate';
import { HELD_REASONS } from '../_portal/types';
import type { Stats } from '../_portal/types';

const RANGES = [7, 30, 90] as const;

function Tile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="portal-tile">
      <dt>{label}</dt>
      <dd>{value.toLocaleString('en')}{note ? <span>{note}</span> : null}</dd>
    </div>
  );
}

function Top<T extends { views: number }>({ title, col, rows, name, empty }: { title: string; col: string; rows: T[]; name: (r: T) => string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  return (
    <section className="portal-card" aria-labelledby={`top-${col}`}>
      <h3 id={`top-${col}`}>{title}</h3>
      {rows.length ? (
        <table className="portal-top">
          <thead><tr><th scope="col">{col}</th><th scope="col">Views</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={name(r)}>
                <th scope="row"><span className="portal-top__bar" style={{ inlineSize: `${(r.views / max) * 100}%` }} aria-hidden="true" /><span className="portal-top__name">{name(r)}</span></th>
                <td>{r.views.toLocaleString('en')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p>{empty}</p>}
    </section>
  );
}

/** What needs a person, then how the public site is doing. Counts only. */
export default function Overview() {
  const { api } = useOperator();
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    void api<Stats>(`/api/portal/stats?days=${days}`).then((r) => { if (live) { if (r.ok) setStats(r.data); else setFailed(true); } });
    return () => { live = false; };
  }, [api, days]);

  const devices = stats ? Object.entries(stats.visits.devices).map(([device, views]) => ({ device, views })).sort((a, b) => b.views - a.views) : [];
  const reasons = stats ? Object.entries(stats.messages.held_reasons).map(([r, views]) => ({ r, views })).sort((a, b) => b.views - a.views) : [];

  return (
    <>
      <div className="portal-titlebar">
        <h1>Overview</h1>
        <div role="group" aria-label="Period" className="portal-range">
          {RANGES.map((r) => <Button key={r} variant={r === days ? 'primary' : 'secondary'} aria-pressed={r === days} onClick={() => setDays(r)}>{r} days</Button>)}
        </div>
      </div>
      {failed ? <p role="alert" className="portal-error">The numbers couldn’t load. Reload to try again.</p> : null}
      {!stats ? <p>Loading…</p> : (
        <>
          <section aria-labelledby="needs">
            <h2 id="needs">Needs a person</h2>
            <dl className="portal-tiles">
              <Tile label="Waiting for a reply" value={stats.messages.waiting} note="all time" />
              <Tile label="Held for review" value={stats.messages.held_waiting} note="all time" />
              <Tile label="Received" value={stats.messages.received} note={`form ${stats.messages.by_source.form ?? 0} · email ${stats.messages.by_source.email ?? 0}`} />
              <Tile label="Marked spam" value={stats.messages.spam} />
            </dl>
          </section>
          <section aria-labelledby="visits">
            <h2 id="visits">Public site</h2>
            <dl className="portal-tiles">
              <Tile label="Visitors" value={stats.visits.visitors} note="counted per day" />
              <Tile label="Page views" value={stats.visits.views} />
              <Tile label="New accounts" value={stats.accounts.new} note={`${stats.accounts.total.toLocaleString('en')} in all`} />
              <Tile label="Documents" value={stats.documents.total} note="in all" />
            </dl>
            <div className="portal-card"><DailyChart daily={stats.visits.daily} days={stats.days} /></div>
            <div className="portal-grid">
              <Top title="Top pages" col="Page" rows={stats.visits.pages} name={(r) => r.path} empty="No visits yet." />
              <Top title="Top referrers" col="Site" rows={stats.visits.referrers} name={(r) => r.host} empty="No visits from other sites yet." />
              <Top title="Top countries" col="Country" rows={stats.visits.countries} name={(r) => r.country} empty="No countries recorded yet." />
              <Top title="Devices" col="Device" rows={devices} name={(r) => r.device} empty="No visits yet." />
              <Top title="Why messages were held" col="Reason" rows={reasons} name={(r) => HELD_REASONS[r.r] ?? r.r} empty="Nothing held in this period." />
            </div>
          </section>
        </>
      )}
    </>
  );
}
