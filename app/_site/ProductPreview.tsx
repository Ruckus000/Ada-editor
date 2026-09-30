'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, SeverityBadge } from '../../design-system/primitives';
import type { Severity } from '../../design-system/primitives';

const FINDINGS: { severity: Severity; title: string; criterion: string }[] = [
  { severity: 'blocker', title: 'Image has no alternative text', criterion: '1.1.1 Non-text Content' },
  { severity: 'violation', title: 'Link text is not meaningful out of context', criterion: '2.4.4 Link Purpose (In Context)' },
  { severity: 'advisory', title: 'Reading level is high', criterion: '3.1.5 Reading Level' },
];

const START = 2100;
const STEP = 700;
const CYCLE = 2800;

/**
 * The hero's product window. It renders finished (checked, three findings)
 * so it reads right without JavaScript or motion; with motion allowed it
 * replays a check: underlines appear, cards slide in, the count climbs, then
 * the highlight cycles between each finding and its text.
 *
 * "Pause motion" (SC 2.2.2) stops the cycle and every looping animation on
 * the page (`.landing[data-motion=paused]` in landing.css).
 */
export function ProductPreview() {
  const [shown, setShown] = useState(FINDINGS.length);
  const [checking, setChecking] = useState(false);
  const [active, setActive] = useState(0);
  const [canMove, setCanMove] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setCanMove(true);
    setShown(0);
    setChecking(true);
    setActive(-1);
    const timers = FINDINGS.map((_, i) => setTimeout(() => setShown(i + 1), START + i * STEP));
    let cycle: ReturnType<typeof setInterval> | undefined;
    timers.push(setTimeout(() => {
      setChecking(false);
      setActive(0);
      cycle = setInterval(() => { if (!pausedRef.current) setActive((a) => (a + 1) % FINDINGS.length); }, CYCLE);
    }, START + FINDINGS.length * STEP + 400));
    return () => { timers.forEach(clearTimeout); clearInterval(cycle); };
  }, []);

  const togglePause = () => {
    const next = !paused;
    pausedRef.current = next;
    setPaused(next);
    const root = document.querySelector<HTMLElement>('.landing');
    if (root) root.dataset.motion = next ? 'paused' : 'running';
  };

  const hl = (i: number) => ({ 'data-hl': i, 'data-on': i < shown || undefined, 'data-active': i === active || undefined });

  return (
    <figure id="product" className="landing-fig" aria-label="Product preview: a document with three underlined problems and a matching list of findings">
      <div className="landing-fig__window">
        <div className="landing-fig__bar">
          <span className="landing-fig__dots" aria-hidden="true"><span /><span /><span /></span>
          <span className="landing-fig__name site-mono">q3-community-update.docx</span>
          <span className="landing-fig__status site-mono" aria-hidden="true">
            <span className="landing-fig__pulse landing-loop" />{checking ? 'Checking…' : 'Checked'}
          </span>
          {canMove ? (
            <Button variant="ghost" className="landing-fig__motion" onClick={togglePause}>{paused ? 'Play motion' : 'Pause motion'}</Button>
          ) : null}
          <span className="landing-fig__std site-mono">WCAG 2.1 AA</span>
        </div>
        <div className="landing-fig__grid">
          <div className="landing-fig__doc">
            <p className="landing-fig__title">Q3 Community Update</p>
            <p>
              Enrollment grew across every district. <span {...hl(0)}>[chart of enrollment]</span> shows the trend. For the
              full report, <span {...hl(1)}>click here</span>.
            </p>
            <p>Our <span {...hl(2)}>multifaceted programmatic engagement paradigm</span> continues.</p>
          </div>
          <div className="landing-fig__findings">
            <div className="landing-fig__head">
              <span>Findings</span>
              <span className="landing-fig__count site-mono"><span key={shown}>{shown}</span></span>
            </div>
            {FINDINGS.map((f, i) => (
              <div key={f.title} className="landing-fig__card" data-shown={i < shown || undefined} data-active={i === active || undefined}>
                <SeverityBadge severity={f.severity} />
                <span className="landing-fig__card-title">{f.title}</span>
                <span className="landing-fig__crit site-mono">{f.criterion}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}
