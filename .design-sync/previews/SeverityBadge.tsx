import { SeverityBadge } from 'ada-editor';

/** The full severity scale, most to least urgent — the order the issue list sorts by. */
export const AllSeverities = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ada-space-2)' }}>
    <SeverityBadge severity="blocker" />
    <SeverityBadge severity="violation" />
    <SeverityBadge severity="advisory" />
    <SeverityBadge severity="manual" />
    <SeverityBadge severity="checked" />
  </div>
);

/** With a WCAG criterion: appended for screen readers only, so it looks the same. */
export const WithCriterion = () => (
  <SeverityBadge severity="violation" showCriterion="2.4.4 Link Purpose" />
);

export const NeedsYourCall = () => <SeverityBadge severity="manual" />;
