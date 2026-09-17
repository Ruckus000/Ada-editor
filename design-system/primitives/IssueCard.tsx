import { forwardRef } from 'react';
import { Button } from './Button';
import { SeverityBadge } from './SeverityBadge';
import type { Issue } from './types';

interface IssueCardProps {
  issue: Issue;
  /** Roving tabindex: only the active card is in the tab order. */
  active: boolean;
  onAccept: (issue: Issue) => void;
  onDismiss: (issue: Issue) => void;
  onReveal: (issue: Issue) => void;
}

/**
 * A card in the issue list — NOT a floating overlay anchored to the text.
 *
 * Grammarly's card floats beside the prose, which splits attention between the
 * underline and the action, and can obscure the focused element (SC 2.4.11).
 * Here the card lives in a stable list region, so its position never depends on
 * where the caret is and nothing overlaps the text.
 */
export const IssueCard = forwardRef<HTMLLIElement, IssueCardProps>(function IssueCard(
  { issue, active, onAccept, onDismiss, onReveal },
  ref
) {
  const titleId = `ada-issue-${issue.id}-title`;
  const descId = `ada-issue-${issue.id}-desc`;

  return (
    <li
      ref={ref}
      className="ada-card"
      data-severity={issue.severity}
      tabIndex={active ? 0 : -1}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onFocus={() => onReveal(issue)}
    >
      <SeverityBadge severity={issue.severity} showCriterion={issue.criterion} />

      <h3 id={titleId} className="ada-card__title">
        {issue.title}
      </h3>

      <p id={descId} className="ada-card__body">
        {issue.explanation}
      </p>

      <p className="ada-card__criterion">
        <span aria-hidden="true">WCAG </span>
        <span className="ada-visually-hidden">Success criterion </span>
        {issue.criterion}
      </p>

      {issue.suggestion ? (
        <p className="ada-card__suggestion">
          <span className="ada-visually-hidden">Suggested replacement: </span>
          <code>{issue.suggestion}</code>
        </p>
      ) : issue.severity === 'manual' ? (
        /* We cannot tell whether this is a problem. Different from knowing it is
         * one and being unable to fix it — the card used to conflate the two. */
        <p className="ada-card__suggestion ada-card__suggestion--judgement">
          This one needs your judgement — it cannot be determined automatically.
        </p>
      ) : null}

      <div className="ada-card__actions">
        {/*
          Action order follows docs/audit/rule-set-spike.md. Measured over 28 real
          documents, only 4.8% of findings carry an automatic fix, and almost all
          of those are "declare a language" — a property of the export, not of the
          prose. Fixing an accessibility finding needs to know what the image
          shows or where the link goes, which is the author's knowledge.

          So the default primary action is to take the author to the text, and
          "Apply fix" is promoted only in the rare case where a fix exists. This
          is the part of Grammarly's model that does not transfer: its central
          interaction is accepting a computed correction, and here there usually
          isn't one.
        */}
        {issue.suggestion ? (
          <Button variant="primary" onClick={() => onAccept(issue)}>
            Apply fix
            <span className="ada-visually-hidden"> for {issue.title}</span>
          </Button>
        ) : null}
        <Button
          variant={issue.suggestion ? 'secondary' : 'primary'}
          onClick={() => onReveal(issue)}
        >
          Go to text
          <span className="ada-visually-hidden"> for {issue.title}</span>
        </Button>
        <Button variant="ghost" onClick={() => onDismiss(issue)}>
          Dismiss
          <span className="ada-visually-hidden"> {issue.title}</span>
        </Button>
      </div>
    </li>
  );
});
