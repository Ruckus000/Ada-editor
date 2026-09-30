'use client';

import { useId, useState } from 'react';

type Day = { day: string; views: number; visitors: number };

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Fill in days with no visits, so gaps read as zero, not as missing bars. */
function allDays(daily: Day[], days: number): Day[] {
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const out: Day[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i)).toISOString().slice(0, 10);
    out.push(byDay.get(d) ?? { day: d, views: 0, visitors: 0 });
  }
  return out;
}

/**
 * Page views per day: one series, one hue (the action colour), thin bars with
 * a 2px gap, rounded tops on a baseline, a recessive grid, a hover/focus
 * tooltip, and the same numbers as a table (dataviz skill: marks, a11y).
 * Single series, so no legend: the heading names it.
 */
export function DailyChart({ daily, days }: { daily: Day[]; days: number }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const data = allDays(daily, days);
  const max = Math.max(1, ...data.map((d) => d.views));
  const W = 720, H = 180, PAD_L = 36, PAD_B = 24, PAD_T = 8;
  const plotW = W - PAD_L, plotH = H - PAD_B - PAD_T;
  const step = plotW / data.length;
  // Thin marks: at most 24px, centred in each day's slot, 2px apart at least.
  const barW = Math.max(2, Math.min(24, step - 2));
  const ticks = [0, Math.round(max / 2), max];
  const active = hover === null ? null : data[hover];

  return (
    <figure className="portal-chart" aria-labelledby={`${id}-cap`}>
      <figcaption id={`${id}-cap`} className="portal-chart__cap">Page views per day, last {days} days</figcaption>
      <div className="portal-chart__plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Bar chart of page views per day. The table below has the same numbers.`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => {
            const y = PAD_T + plotH - (t / max) * plotH;
            return (
              <g key={t}>
                <line x1={PAD_L} x2={W} y1={y} y2={y} className="portal-chart__grid" />
                <text x={PAD_L - 6} y={y + 4} textAnchor="end" className="portal-chart__tick">{t}</text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const h = (d.views / max) * plotH;
            const x = PAD_L + i * step + (step - barW) / 2;
            return (
              <g key={d.day} onMouseEnter={() => setHover(i)}>
                <rect x={PAD_L + i * step} y={PAD_T} width={step} height={plotH} fill="transparent" />
                {h > 0 ? <path className="portal-chart__bar" data-active={hover === i || undefined} d={`M${x},${PAD_T + plotH} v${-(h - Math.min(4, h))} q0,${-Math.min(4, h)} ${Math.min(4, barW / 2)},${-Math.min(4, h)} h${barW - 2 * Math.min(4, barW / 2)} q${Math.min(4, barW / 2)},0 ${Math.min(4, barW / 2)},${Math.min(4, h)} v${h - Math.min(4, h)} z`} /> : null}
              </g>
            );
          })}
          <line x1={PAD_L} x2={W} y1={PAD_T + plotH} y2={PAD_T + plotH} className="portal-chart__axis" />
          <text x={PAD_L} y={H - 6} className="portal-chart__tick">{fmtDay(data[0]!.day)}</text>
          <text x={W} y={H - 6} textAnchor="end" className="portal-chart__tick">{fmtDay(data[data.length - 1]!.day)}</text>
        </svg>
        <p className="portal-chart__tip" aria-live="polite">{active ? `${fmtDay(active.day)}: ${active.views} views, ${active.visitors} visitors` : ' '}</p>
      </div>
      <details className="portal-chart__table">
        <summary>Show as a table</summary>
        <table>
          <thead><tr><th scope="col">Day</th><th scope="col">Views</th><th scope="col">Visitors</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.day}><th scope="row">{fmtDay(d.day)}</th><td>{d.views}</td><td>{d.visitors}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}
