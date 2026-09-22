import { IssueList, LiveAnnouncer } from 'ada-editor';
import { FIXTURES } from '../../scripts/harness/fixtures';

const noop = () => {};

/**
 * One LiveAnnouncer at the app root. It renders its children plus two
 * visually hidden live regions; IssueList announces outcomes through it.
 */
export const AppRoot = () => (
  <LiveAnnouncer>
    <IssueList issues={FIXTURES.slice(0, 2)} onAccept={noop} onDismiss={noop} onReveal={noop} />
  </LiveAnnouncer>
);
