'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { BrandMark } from '../_site/BrandMark';
import './status.css';

/**
 * One screen for "this can't be shown": the error boundary, unknown URLs and
 * missing documents. Focus moves to the heading because an error boundary
 * swaps out the tree that held focus — left alone, it falls to <body>.
 */
export function StatusScreen({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [title]);
  // The brand is text, not a link: the action is the way out, and two links
  // to the desk would compete.
  return (
    <div className="status">
      <header className="status__top"><span className="ada-brand"><span className="ada-brand__mark" aria-hidden="true"><BrandMark /></span>Ada Editor</span></header>
      <main className="status__main">
        <title>{`${title} · Ada Editor`}</title>
        <div className="status__sheet">
          <h1 ref={heading} tabIndex={-1} className="status__title">{title}</h1>
          <p className="status__body">{children}</p>
          {actions ? <div className="status__actions">{actions}</div> : null}
        </div>
      </main>
    </div>
  );
}
