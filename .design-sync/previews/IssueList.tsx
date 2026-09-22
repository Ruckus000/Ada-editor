import { IssueList, LiveAnnouncer } from 'ada-editor';
import { FIXTURES } from '../../scripts/harness/fixtures';

const noop = () => {};

/** The canonical findings panel, sorted by severity. */
export const Findings = () => (
  <LiveAnnouncer>
    <IssueList issues={FIXTURES} onAccept={noop} onDismiss={noop} onReveal={noop} />
  </LiveAnnouncer>
);

/** Deliberately not a green "compliant" state. */
export const NoFindings = () => (
  <LiveAnnouncer>
    <IssueList issues={[]} onAccept={noop} onDismiss={noop} onReveal={noop} />
  </LiveAnnouncer>
);
