import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { IssueList } from '../../design-system/primitives/IssueList';
import { LiveAnnouncer } from '../../design-system/primitives/LiveAnnouncer';
import { SEVERITY_ENCODING } from '../../design-system/primitives/severity';
import { useRegionCycling } from '../../design-system/primitives/useRegionCycling';
import type { Issue } from '../../design-system/primitives/types';
import { FIXTURES } from './fixtures';

/** Prose fragments the fixture findings point at, so underlines have something to mark. */
const PROSE: ReadonlyArray<{ before: string; mark?: { id: string; text: string }; after: string }> = [
  { before: 'The quarterly report includes ', mark: { id: 'alt-missing', text: 'a chart image with no description' }, after: ', which readers using a screen reader will not receive at all.' },
  { before: 'Our findings ', mark: { id: 'link-purpose', text: 'are detailed in the document that can be found by clicking here' }, after: ', alongside supporting data.' },
  { before: 'We ', mark: { id: 'reading-level', text: 'utilise a methodology predicated upon' }, after: ' longitudinal sampling.' },
  { before: 'See ', mark: { id: 'alt-quality', text: 'Figure 3 (alt: "chart")' }, after: ' for the breakdown.' },
];

export function App() {
  const [issues, setIssues] = useState<Issue[]>(FIXTURES);
  const [revealed, setRevealed] = useState<string | null>(null);

  const editorRef = useRef<HTMLElement>(null);
  const findingsRef = useRef<HTMLDivElement>(null);
  const regions = useMemo(() => [editorRef, findingsRef], []);
  useRegionCycling(regions);

  const byId = new Map(issues.map((i) => [i.id, i]));
  const remove = (issue: Issue) => setIssues((current) => current.filter((i) => i.id !== issue.id));

  return (
    <LiveAnnouncer>
      <div className="harness">
        <main className="harness__doc" ref={editorRef} tabIndex={-1} aria-label="Document">
          <h1>Design system preview</h1>
          <div className="ada-editor">
            {PROSE.map((line, index) => {
              const issue = line.mark ? byId.get(line.mark.id) : undefined;
              return (
                <p key={index}>
                  {line.before}
                  {line.mark && issue ? (
                    <span
                      className="ada-underline"
                      data-severity={issue.severity}
                      data-issue-id={issue.id}
                      data-revealed={revealed === issue.id ? 'true' : undefined}
                      style={{
                        textDecorationLine: 'underline',
                        textDecorationStyle: SEVERITY_ENCODING[issue.severity]
                          .underline as CSSProperties['textDecorationStyle'],
                        textDecorationThickness:
                          SEVERITY_ENCODING[issue.severity].underline === 'double' ? '2px' : '1px',
                        textUnderlineOffset: '3px',
                      }}
                    >
                      {line.mark.text}
                    </span>
                  ) : (
                    line.mark?.text
                  )}
                  {line.after}
                </p>
              );
            })}
          </div>
        </main>

        <div ref={findingsRef} tabIndex={-1}>
          <IssueList
            issues={issues}
            onAccept={remove}
            onDismiss={remove}
            onReveal={(issue) => setRevealed(issue.id)}
          />
        </div>
      </div>
    </LiveAnnouncer>
  );
}
