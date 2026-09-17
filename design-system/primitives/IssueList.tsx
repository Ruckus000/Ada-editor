import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IssueCard } from './IssueCard';
import { useAnnounce } from './LiveAnnouncer';
import { SEVERITY_RANK } from './severity';
import type { Issue } from './types';

interface IssueListProps {
  issues: Issue[];
  onAccept: (issue: Issue) => void;
  onDismiss: (issue: Issue) => void;
  /** Scroll/highlight the matching range in the editor. Never moves focus. */
  onReveal: (issue: Issue) => void;
}

/**
 * THE CANONICAL INTERFACE.
 *
 * This inverts Grammarly's model. There, the floating card is primary and the
 * list is a secondary view. Here the list is the product: every finding can be
 * read, understood, applied and dismissed from this region without ever
 * entering the contenteditable surface. That matters because contenteditable
 * plus screen readers is an unreliable combination, and because there is no
 * broadly-supported ARIA mechanism for "this span carries an accessibility
 * annotation" (aria-invalid only covers spelling and grammar). Relying on
 * inline annotation alone would make findings unreachable for some users.
 *
 * Keyboard model, adapted from the one genuinely good part of Grammarly's:
 *   ArrowDown / ArrowUp  move between findings (roving tabindex)
 *   Home / End           first / last finding
 *   Enter                apply the fix, when one exists
 *   Escape               dismiss the focused finding
 *   Tab                  into the focused card's buttons, then out of the list
 */
export function IssueList({ issues, onAccept, onDismiss, onReveal }: IssueListProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const refs = useRef<Array<HTMLLIElement | null>>([]);
  const announce = useAnnounce();

  const sorted = useMemo(
    () => [...issues].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]),
    [issues]
  );

  const manualCount = sorted.filter((i) => i.severity === 'manual').length;

  // Keep the active index in range as findings are applied or dismissed.
  useEffect(() => {
    setActiveIndex((i) => Math.max(0, Math.min(i, sorted.length - 1)));
  }, [sorted.length]);

  const focusAt = useCallback((index: number) => {
    setActiveIndex(index);
    refs.current[index]?.focus();
  }, []);

  const remaining = useCallback(
    (after: number) => {
      const manual = manualCount;
      if (after === 0) {
        return manual > 0
          ? `No automated findings left. ${manual} still need your review.`
          : 'No automated findings left.';
      }
      return `${after} finding${after === 1 ? '' : 's'} remaining.`;
    },
    [manualCount]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    const last = sorted.length - 1;
    const issue = sorted[activeIndex];
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusAt(Math.min(activeIndex + 1, last));
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(Math.max(activeIndex - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusAt(last);
        break;
      case 'Enter':
        if (issue?.suggestion && event.target === refs.current[activeIndex]) {
          event.preventDefault();
          onAccept(issue);
          announce(`Applied fix for ${issue.title}. ${remaining(sorted.length - 1)}`);
        }
        break;
      case 'Escape':
        if (issue) {
          event.preventDefault();
          onDismiss(issue);
          announce(`Dismissed ${issue.title}. ${remaining(sorted.length - 1)}`);
        }
        break;
      default:
        break;
    }
  };

  if (sorted.length === 0) {
    return (
      <section className="ada-issues" aria-labelledby="ada-issues-heading">
        <h2 id="ada-issues-heading" className="ada-issues__heading">
          Accessibility findings
        </h2>
        {/*
          Deliberately NOT a green "compliant" state.

          Automated checking covers roughly a third of WCAG. A success badge here
          would tell the user their document is compliant when the tool cannot
          know that — which, for a product sold on compliance, is a liability
          rather than a UX nicety.
        */}
        <p className="ada-issues__empty">
          No automated findings.{' '}
          <strong>
            Automated checks cannot confirm compliance — alt-text quality, link
            wording and heading logic still need a human read.
          </strong>
        </p>
      </section>
    );
  }

  return (
    <section className="ada-issues" aria-labelledby="ada-issues-heading">
      <h2 id="ada-issues-heading" className="ada-issues__heading">
        Accessibility findings
        <span className="ada-issues__count"> ({sorted.length})</span>
      </h2>

      <ul
        className="ada-issues__list"
        // A composite widget: one tab stop, arrow keys move within.
        role="list"
        aria-describedby="ada-issues-help"
        onKeyDown={handleKeyDown}
      >
        {sorted.map((issue, index) => (
          <IssueCard
            key={issue.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            issue={issue}
            active={index === activeIndex}
            onAccept={(i) => {
              onAccept(i);
              announce(`Applied fix for ${i.title}. ${remaining(sorted.length - 1)}`);
            }}
            onDismiss={(i) => {
              onDismiss(i);
              announce(`Dismissed ${i.title}. ${remaining(sorted.length - 1)}`);
            }}
            onReveal={onReveal}
          />
        ))}
      </ul>

      <p id="ada-issues-help" className="ada-visually-hidden">
        Use the up and down arrow keys to move between findings. Press Enter to
        apply a fix, or Escape to dismiss a finding.
      </p>
    </section>
  );
}
