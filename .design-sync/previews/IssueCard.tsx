import { IssueCard } from 'ada-editor';
import { FIXTURES } from '../../scripts/harness/fixtures';

const noop = () => {};
const byId = (id: string) => FIXTURES.find((i) => i.id === id)!;

// IssueCard renders an <li>; it always lives inside the issue list's <ul>.
const Frame = ({ id }: { id: string }) => (
  <ul className="ada-issues__list" role="list" style={{ maxInlineSize: '26rem' }}>
    <IssueCard issue={byId(id)} active onAccept={noop} onDismiss={noop} onReveal={noop} />
  </ul>
);

/** A machine fix exists: "Apply fix" is primary, the replacement text is shown. */
export const WithFix = () => <Frame id="link-purpose" />;

/** No fix: the common case. "Go to text" becomes the primary action. */
export const BlockerNoFix = () => <Frame id="alt-missing" />;

/** Not machine-decidable: the card says so instead of guessing. */
export const NeedsJudgement = () => <Frame id="alt-quality" />;

export const Advisory = () => <Frame id="reading-level" />;
