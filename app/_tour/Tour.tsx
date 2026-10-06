'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button, VisuallyHidden, useAnnounce } from '../../design-system/primitives';
import { markTourSeen, tourSeen } from '../_data/tour';
import type { TourName } from '../_data/tour';
import './tour.css';

export type TourStep = { target: string; title: string; body: string };

/**
 * A first-run tour that never takes over. It is offered, not started: a small
 * card at the end of the page that leaves focus where it is (moving focus on
 * page load strands keyboard and screen reader users). Start tour moves focus
 * into the steps; each step outlines its control and scrolls it into view.
 * Steps whose control isn't on screen are skipped. Escape, Skip or Done end
 * it, and it isn't offered again on any of the person's devices.
 */
export function Tour({ name, steps, ready }: { name: TourName; steps: TourStep[]; ready: boolean }) {
  const announce = useAnnounce();
  const [phase, setPhase] = useState<'hidden' | 'offer' | 'touring'>('hidden');
  const [shown, setShown] = useState<TourStep[]>([]);
  const [at, setAt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);

  // Not announced: the page's one live region often carries something that
  // matters more at this moment ("Deleted …", "Imported …"), and the offer
  // would replace it. It is a labelled region with a heading, so it can be found.
  useEffect(() => {
    if (ready && !tourSeen(name)) setPhase('offer');
  }, [ready, name]);

  // The current step: outline its control, bring it into view, and put focus on the step.
  useEffect(() => {
    if (phase !== 'touring') return;
    const el = document.querySelector(shown[at]!.target);
    el?.setAttribute('data-tour-current', '');
    el?.scrollIntoView({ block: 'center' }); // clear of the card at the bottom of the screen
    heading.current?.focus();
    return () => el?.removeAttribute('data-tour-current');
  }, [phase, at, shown]);

  const end = (said: string) => {
    const last = phase === 'touring' ? document.querySelector<HTMLElement>(shown[at]!.target) : null;
    setPhase('hidden');
    markTourSeen(name);
    announce(said);
    // Land on the control the tour was showing, so focus isn't lost with the panel.
    if (last) requestAnimationFrame(() => last.querySelector<HTMLElement>('button, a, [tabindex]')?.focus() ?? last.focus());
  };

  const start = () => {
    const present = steps.filter((s) => document.querySelector(s.target));
    if (!present.length) { end('Tour skipped.'); return; }
    setShown(present);
    setAt(0);
    setPhase('touring');
  };

  if (phase === 'hidden') return null;
  if (phase === 'offer') {
    return (
      <div className="tour" role="region" aria-labelledby="tour-offer">
        <h2 id="tour-offer" className="tour__title">New here?</h2>
        <p className="tour__body">A short tour shows where everything is. It takes about a minute.</p>
        <div className="tour__actions">
          <Button variant="ghost" onClick={() => end('Tour dismissed. You can take it any time from Help.')}>Not now</Button>
          <Button variant="primary" onClick={start}>Start tour</Button>
        </div>
      </div>
    );
  }
  const step = shown[at]!;
  const last = at === shown.length - 1;
  return (
    <div
      className="tour"
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-step"
      onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); end('Tour ended.'); } }}
    >
      <p className="tour__count" aria-hidden="true">{`Step ${at + 1} of ${shown.length}`}</p>
      {/* Focus lands here, and only the heading is read: it carries the count too. */}
      <h2 id="tour-step" ref={heading} tabIndex={-1} className="tour__title">{step.title}<VisuallyHidden>{`, step ${at + 1} of ${shown.length}`}</VisuallyHidden></h2>
      <p className="tour__body">{step.body}</p>
      <div className="tour__actions">
        <Button variant="ghost" className="tour__skip" onClick={() => end('Tour ended.')}>Skip tour</Button>
        {at > 0 ? <Button variant="secondary" onClick={() => setAt(at - 1)}>Back</Button> : null}
        <Button variant="primary" onClick={() => (last ? end('Tour finished.') : setAt(at + 1))}>{last ? 'Done' : 'Next'}</Button>
      </div>
    </div>
  );
}
