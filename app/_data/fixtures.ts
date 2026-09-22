import type { Severity } from '../../design-system/primitives';

/**
 * Fixture data for the app screens. There is no document store or checking
 * service yet; when one exists it replaces this module and nothing else.
 *
 * `checked` is not an open-finding severity, so documents only count the four
 * severities a person still has to act on.
 */
export type OpenSeverity = Exclude<Severity, 'checked'>;
export const OPEN_SEVERITIES: readonly OpenSeverity[] = ['blocker', 'violation', 'advisory', 'manual'];

export interface DocSummary {
  id: string;
  title: string;
  owner: string;
  targets: string[];
  counts: Partial<Record<OpenSeverity, number>>;
  lastChecked: string;
  /** Position in "most recently checked" order. */
  order: number;
}

export const DOCS: DocSummary[] = [
  { id: 'shelter-faq', title: 'Winter Shelter Program FAQ', owner: 'M. Okafor', targets: ['WCAG 2.1 AA'], counts: { blocker: 2, violation: 3, advisory: 1 }, lastChecked: '12 min ago', order: 1 },
  { id: 'hearing-notice', title: 'Notice of Public Hearing — Draft', owner: 'You', targets: ['WCAG 2.1 AA', 'Section 508', 'PDF/UA'], counts: { blocker: 1, violation: 1, advisory: 1, manual: 1 }, lastChecked: '2 min ago', order: 0 },
  { id: 'benefits-guide', title: 'Benefits Application Guide', owner: 'M. Okafor', targets: ['WCAG 2.1 AA', 'Section 508'], counts: { violation: 2, advisory: 1 }, lastChecked: '1 h ago', order: 2 },
  { id: 'health-advisory', title: 'Public Health Advisory — Update', owner: 'You', targets: ['WCAG 2.1 AA'], counts: { violation: 1, manual: 2 }, lastChecked: '3 h ago', order: 3 },
  { id: 'transit-notice', title: 'Transit Service Change Notice', owner: 'R. Ibarra', targets: ['WCAG 2.1 AA', 'Section 508'], counts: { advisory: 2 }, lastChecked: 'Yesterday', order: 4 },
  { id: 'zoning-variance', title: 'Zoning Variance Notice', owner: 'You', targets: ['WCAG 2.1 AA'], counts: { manual: 1 }, lastChecked: 'Yesterday', order: 5 },
  { id: 'water-quality', title: 'Water Quality Report 2026', owner: 'T. Lund', targets: ['WCAG 2.1 AA', 'PDF/UA'], counts: {}, lastChecked: 'Mar 3', order: 6 },
  { id: 'voter-deadlines', title: 'Voter Registration Deadlines', owner: 'T. Lund', targets: ['WCAG 2.1 AA', 'Section 508'], counts: {}, lastChecked: 'Mar 1', order: 7 },
];

export const MANUAL_ITEMS: { question: string; docId: string }[] = [
  { question: 'Does this map image need a long description?', docId: 'health-advisory' },
  { question: 'Is "Read the full notice" clear out of context?', docId: 'health-advisory' },
  { question: 'Is the reading order correct after the two-column break?', docId: 'zoning-variance' },
  { question: 'Is the table a data table or a layout table?', docId: 'hearing-notice' },
];

export const CRITERIA: { id: string; name: string; count: number }[] = [
  { id: '1.1.1', name: 'Non-text Content', count: 6 },
  { id: '2.4.4', name: 'Link Purpose (In Context)', count: 4 },
  { id: '1.4.3', name: 'Contrast (Minimum)', count: 4 },
  { id: '1.3.1', name: 'Info and Relationships', count: 3 },
  { id: '3.1.2', name: 'Language of Parts', count: 2 },
];

export const findDoc = (id: string) => DOCS.find((d) => d.id === id);

/* ---------- editor content ---------- */

/** A finding before it is anchored to document positions. */
export interface FindingSeed {
  id: string;
  severity: OpenSeverity;
  title: string;
  explanation: string;
  criterion: string;
  suggestion?: string;
  /** Short label for the collapsed list row, e.g. "clicking here". */
  excerpt: string;
  /** What to do, for the collapsed list row. */
  hint: string;
}

/** One paragraph: plain text around a single flagged span. */
export interface ProseLine {
  before: string;
  text: string;
  after: string;
  finding?: FindingSeed;
}

export interface DocContent {
  heading: string;
  subheading: string;
  lines: ProseLine[];
  header: string;
  footer: string;
}

const HEARING_NOTICE: DocContent = {
  heading: 'Notice of Public Hearing',
  subheading: 'City Planning Commission — draft for publication',
  header: 'City Planning Commission',
  footer: 'Notice of Public Hearing — Page 1 of 2',
  lines: [
    {
      before: 'This notice includes ', text: 'a site plan graphic with no description', after: ', which residents using a screen reader will not receive at all.',
      finding: { id: 'site-plan-alt', severity: 'blocker', title: 'Image has no alternative text', explanation: 'Screen readers will announce nothing for this site plan graphic, so its content is unavailable.', criterion: '1.1.1 Non-text Content', excerpt: 'alt text', hint: 'Add a description' },
    },
    {
      before: 'The full meeting agenda ', text: 'can be found by clicking here', after: ', along with supporting materials.',
      finding: { id: 'agenda-link', severity: 'violation', title: 'Link text is not meaningful out of context', explanation: '"Clicking here" tells a resident navigating by links nothing about the destination.', criterion: '2.4.4 Link Purpose', suggestion: 'is available as a linked PDF', excerpt: 'clicking here', hint: 'Rewrite the link text' },
    },
    {
      before: 'Affected parties shall ', text: 'submit comments utilising the online portal prior to the aforementioned deadline', after: '.',
      finding: { id: 'comment-instructions', severity: 'advisory', title: 'Reading level is above the target', explanation: 'This sentence reads at roughly grade 16. Plain language helps every resident understand how to participate.', criterion: '3.1.5 Reading Level', suggestion: 'submit comments online before the deadline', excerpt: 'reading level', hint: 'Simplify the sentence' },
    },
    {
      before: 'See ', text: 'Site Plan (alt: "map")', after: ' for the proposed layout.',
      finding: { id: 'site-plan-quality', severity: 'manual', title: 'Alt text may not describe the image', explanation: '"map" is present but may not convey what the site plan shows. Only staff can tell.', criterion: '1.1.1 Non-text Content', excerpt: 'alt: "map"', hint: 'Confirm it describes the image' },
    },
  ],
};

/**
 * Only the hearing notice has bespoke content. Every other document is built
 * from this bank so the editor's findings always agree with the dashboard's
 * counts for that document.
 */
type BankEntry = Omit<ProseLine, 'finding'> & { finding: Omit<FindingSeed, 'id' | 'severity'> };

const BANK: Record<OpenSeverity, BankEntry[]> = {
  blocker: [
    { before: 'The eligibility chart ', text: 'is shown as an image only', after: ' and has no text equivalent.', finding: { title: 'Image has no alternative text', explanation: 'Screen readers announce nothing for this chart, so the eligibility rules are unavailable.', criterion: '1.1.1 Non-text Content', excerpt: 'chart image', hint: 'Add a description' } },
    { before: 'Use the form below: ', text: 'Name ____ Address ____', after: ' and return it to the front desk.', finding: { title: 'Form fields have no labels', explanation: 'Blank lines are not fields a screen reader can identify or fill in.', criterion: '1.3.1 Info and Relationships', excerpt: 'unlabelled form', hint: 'Use real labelled fields' } },
  ],
  violation: [
    { before: 'For locations, ', text: 'click here', after: '.', finding: { title: 'Link text is not meaningful out of context', explanation: '"Click here" tells someone navigating by links nothing about the destination.', criterion: '2.4.4 Link Purpose', suggestion: 'see the list of locations', excerpt: 'click here', hint: 'Rewrite the link text' } },
    { before: 'Deadlines are ', text: 'shown in light grey', after: ' beside each program.', finding: { title: 'Text contrast is below 4.5:1', explanation: 'Light grey on white is hard to read for people with low vision.', criterion: '1.4.3 Contrast (Minimum)', excerpt: 'light grey text', hint: 'Darken the text colour' } },
    { before: 'Spanish-language help: ', text: 'Llame al 311 para ayuda', after: '.', finding: { title: 'Change of language is not marked', explanation: 'Screen readers will pronounce this Spanish sentence with English rules.', criterion: '3.1.2 Language of Parts', excerpt: 'Spanish text', hint: 'Mark the language' } },
  ],
  advisory: [
    { before: 'Applicants must ', text: 'furnish documentation substantiating residency', after: '.', finding: { title: 'Reading level is above the target', explanation: 'Plain language helps every resident understand what to bring.', criterion: '3.1.5 Reading Level', suggestion: 'bring proof of where you live', excerpt: 'reading level', hint: 'Simplify the sentence' } },
    { before: 'Routes ', text: 'marked with an asterisk', after: ' change on Monday.', finding: { title: 'Meaning relies on a symbol', explanation: 'An asterisk is easy to miss and is often not announced by screen readers.', criterion: 'Best practice', excerpt: 'asterisk', hint: 'Say it in words' } },
  ],
  manual: [
    { before: 'See ', text: 'the attached map', after: ' for the affected area.', finding: { title: 'Does this map need a long description?', explanation: 'Only someone who knows the map can say whether its alt text is enough.', criterion: '1.1.1 Non-text Content', excerpt: 'map', hint: 'Decide on a long description' } },
    { before: 'The two-column section ', text: 'continues on the next page', after: '.', finding: { title: 'Is the reading order correct here?', explanation: 'The engine cannot tell whether the columns read in the intended order.', criterion: '1.3.2 Meaningful Sequence', excerpt: 'reading order', hint: 'Check the order' } },
  ],
};

export function contentFor(doc: DocSummary): DocContent {
  if (doc.id === 'hearing-notice') return HEARING_NOTICE;
  const lines: ProseLine[] = [];
  for (const severity of OPEN_SEVERITIES) {
    const bank = BANK[severity];
    for (let i = 0; i < (doc.counts[severity] ?? 0); i++) {
      const entry = bank[i % bank.length]!;
      lines.push({ ...entry, finding: { ...entry.finding, id: `${doc.id}-${severity}-${i}`, severity } });
    }
  }
  if (lines.length === 0) {
    lines.push({ before: 'This document has ', text: 'no open findings', after: ' from the last automated check.' });
  }
  return {
    heading: doc.title.replace(/ — Draft$/, ''),
    subheading: `${doc.owner === 'You' ? 'Your draft' : `Owned by ${doc.owner}`} — ${doc.targets.join(', ')}`,
    header: doc.title,
    footer: `${doc.title} — Page 1 of 1`,
    lines,
  };
}
