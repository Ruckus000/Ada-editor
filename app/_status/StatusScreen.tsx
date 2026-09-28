'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import './status.css';

/**
 * One screen for "this can't be shown": the error boundary, unknown URLs and
 * missing documents. Focus moves to the heading because an error boundary
 * swaps out the tree that held focus — left alone, it falls to <body>.
 */
export function StatusScreen({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [title]);
  return (
    <main className="status">
      <title>{`${title} · Ada Editor`}</title>
      <h1 ref={heading} tabIndex={-1} className="status__title">{title}</h1>
      <p className="status__body">{children}</p>
      {actions ? <div className="status__actions">{actions}</div> : null}
    </main>
  );
}
