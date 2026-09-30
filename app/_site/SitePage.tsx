import type { ReactNode } from 'react';
import { OnThisPage } from './OnThisPage';
import './page.css';

type Props = {
  eyebrow: string;
  title: string;
  /** Hero wash: the design gives each statement page its own second colour. */
  tint: 'violet' | 'green';
  lead: ReactNode;
  heroExtra?: ReactNode;
  toc: { id: string; label: string }[];
  children: ReactNode;
};

/** Shared frame for the accessibility statement and the privacy notice. */
export function SitePage({ eyebrow, title, tint, lead, heroExtra, toc, children }: Props) {
  return (
    <>
      <section className="page-hero" data-tint={tint} aria-labelledby="page-title">
        <div className="page-hero__wash" aria-hidden="true" />
        <div className="page-hero__inner">
          <p data-rv="" className="page-kicker">{eyebrow}</p>
          <h1 id="page-title" data-rv="" data-rv-delay="60" className="page-h1">{title}</h1>
          <p data-rv="" data-rv-delay="140" className="page-lead">{lead}</p>
          {heroExtra}
        </div>
      </section>
      <div className="page-content">
        <OnThisPage items={toc} />
        <div className="page-col">{children}</div>
      </div>
    </>
  );
}

export function PageSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="page-sec" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} data-rv="" className="page-h2">{title}</h2>
      {children}
    </section>
  );
}
