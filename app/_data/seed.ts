import type { Node as PMNode } from 'prosemirror-model';
import type { OpenSeverity } from '../../design-system/primitives/openSeverity';
import { schema } from '../_editor/editorSchema';

/**
 * Seed content for the localStorage store (app/_data/store.ts), replacing the
 * old fixtures module. The difference is fundamental: fixtures carried
 * hand-authored findings next to the text; seeds carry only text, and every
 * finding shown in the app is computed by the real engine (app/_engine).
 *
 * The seed content is deliberately crafted so the ported rules fire across all
 * four severities — a figure without alt (blocker), generic and raw-URL links
 * (violation), a heading-level jump with its mechanical fix (violation), text
 * colours below 4.5:1 with their one-click fix (violation), typed fill-in
 * blanks (manual), dense
 * and overlong prose (advisory), a terse alt and a colour-only instruction
 * (manual) — and two documents stay clean so the "no open findings" states are
 * real, not authored.
 */

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

export interface SeedSpan {
  text: string;
  link?: string;
  strong?: boolean;
  /** Text colour and highlight, as the toolbar sets them. */
  color?: string;
  highlight?: string;
  /** Another language (BCP 47), as the toolbar's Language menu sets it. */
  lang?: string;
}

export type SeedBlock =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; spans: (string | SeedSpan)[] }
  | { kind: 'figure'; id: string; alt: string; label: string };

export interface DocContent {
  /** Becomes the document's h1 — every seed doc has a top-level heading. */
  title: string;
  subheading: string;
  blocks: SeedBlock[];
  header: string;
  footer: string;
}

export interface SeedDoc {
  id: string;
  title: string;
  owner: string;
  targets: string[];
  content: DocContent;
}

/** 39 words: over the long-sentence threshold of 35. */
const LONG_TRANSIT = 'Riders who depend on the downtown transfer station for their daily commute should note that the platform assignments will change beginning Monday and continue through the end of the season, so please check the posted signs carefully before boarding.';
/** 40 words: also over the threshold, in the hearing notice. */
const LONG_HEARING = 'Residents who wish to speak at the hearing must sign up at the front desk no later than fifteen minutes before the scheduled start time, and each speaker will be allotted three minutes to present their comments to the commission.';
/** 26+ words of dense bureaucratese: grades well above 12 on the spike's validated formula. */
const DENSE = (opening: string) => `${opening} prior to the aforementioned deadline, notwithstanding any prior determination issued by the commission to the contrary in this particular matter.`;

export const SEEDS: SeedDoc[] = [
  {
    id: 'hearing-notice',
    title: 'Notice of Public Hearing — Draft',
    owner: 'You',
    targets: ['WCAG 2.1 AA', 'Section 508', 'PDF/UA'],
    content: {
      title: 'Notice of Public Hearing',
      subheading: 'City Planning Commission — draft for publication',
      header: 'City Planning Commission',
      footer: 'Notice of Public Hearing — Page 1 of 2',
      blocks: [
        { kind: 'paragraph', spans: ['This notice includes a site plan graphic. Residents using a screen reader will not receive its content at all.'] },
        { kind: 'figure', id: 'img-1', alt: '', label: 'site plan graphic' },
        { kind: 'paragraph', spans: ['The full meeting agenda ', { text: 'click here', link: 'https://city.example.gov/agenda' }, ', along with supporting materials.'] },
        { kind: 'heading', level: 3, text: 'Public Comment' },
        { kind: 'paragraph', spans: [DENSE('Affected parties shall submit comments utilising the online portal')] },
        { kind: 'paragraph', spans: [LONG_HEARING] },
        { kind: 'figure', id: 'img-2', alt: 'map', label: 'location map' },
        { kind: 'paragraph', spans: ['See ', { text: 'Site Plan', strong: true }, ' above. Deadlines are shown in red beside each program.'] },
      ],
    },
  },
  {
    id: 'shelter-faq',
    title: 'Winter Shelter Program FAQ',
    owner: 'M. Okafor',
    targets: ['WCAG 2.1 AA'],
    content: {
      title: 'Winter Shelter Program FAQ',
      subheading: 'Answers to the questions we hear most often',
      header: 'Winter Shelter Program',
      footer: 'Winter Shelter Program FAQ — Page 1 of 1',
      blocks: [
        { kind: 'figure', id: 'img-1', alt: '', label: 'eligibility chart' },
        { kind: 'paragraph', spans: ['For shelter locations, ', { text: 'click here', link: 'https://city.example.gov/shelter' }, '.'] },
        { kind: 'paragraph', spans: [DENSE('Applicants must furnish documentation substantiating residency')] },
        { kind: 'paragraph', spans: ['The shelter opens nightly at seven and closes at six in the morning.'] },
        // Unmarked Spanish: screen readers read it with English pronunciation (3.1.2).
        { kind: 'paragraph', spans: ['Spanish-language help: Llame al 311 para ayuda.'] },
      ],
    },
  },
  {
    id: 'benefits-guide',
    title: 'Benefits Application Guide',
    owner: 'M. Okafor',
    targets: ['WCAG 2.1 AA', 'Section 508'],
    content: {
      title: 'Benefits Application Guide',
      subheading: 'What to bring and how to apply',
      header: 'Benefits Application Guide',
      footer: 'Benefits Application Guide — Page 1 of 1',
      blocks: [
        { kind: 'paragraph', spans: ['How to apply for benefits this year.'] },
        { kind: 'figure', id: 'img-1', alt: 'Image of the application form', label: 'application form' },
        { kind: 'paragraph', spans: ['Details are available in the ', { text: 'learn more', link: 'https://city.example.gov/benefits' }, ' section.'] },
        { kind: 'heading', level: 2, text: 'What to bring' },
        { kind: 'paragraph', spans: ['You must bring proof of where you live before the deadline. If you do not, we cannot process the form that you sent to us last week.'] },
        // The toolbar's Gray text on its Blue highlight: 3.96:1, below 4.5:1.
        { kind: 'paragraph', spans: ['Deadlines are ', { text: 'shown in light grey', color: '#5E6C84', highlight: '#CCE0FF' }, ' beside each program.'] },
        // Two typed blanks: one Needs-your-call question for the document (form-blank).
        { kind: 'paragraph', spans: ['Use the form below: Name ____ Address ____ and return it to the front desk.'] },
      ],
    },
  },
  {
    id: 'health-advisory',
    title: 'Public Health Advisory — Update',
    owner: 'You',
    targets: ['WCAG 2.1 AA'],
    content: {
      title: 'Public Health Advisory',
      subheading: 'Update for the affected area',
      header: 'Public Health Advisory',
      footer: 'Public Health Advisory — Page 1 of 1',
      blocks: [
        { kind: 'figure', id: 'img-1', alt: 'Map of the affected area along the river', label: 'affected area map' },
        { kind: 'paragraph', spans: ['See the areas marked in red for the affected area.'] },
        { kind: 'paragraph', spans: [{ text: 'https://city.example.gov/health/advisory/2026/update', link: 'https://city.example.gov/health/advisory/2026/update' }] },
      ],
    },
  },
  {
    id: 'transit-notice',
    title: 'Transit Service Change Notice',
    owner: 'R. Ibarra',
    targets: ['WCAG 2.1 AA', 'Section 508'],
    content: {
      title: 'Transit Service Change Notice',
      subheading: 'Platform changes beginning Monday',
      header: 'Transit Service Change',
      footer: 'Transit Service Change Notice — Page 1 of 1',
      blocks: [
        { kind: 'heading', level: 2, text: '' },
        { kind: 'paragraph', spans: [LONG_TRANSIT] },
      ],
    },
  },
  {
    id: 'zoning-variance',
    title: 'Zoning Variance Notice',
    owner: 'You',
    targets: ['WCAG 2.1 AA'],
    content: {
      title: 'Zoning Variance Notice',
      subheading: 'Parcels one and two',
      header: 'Zoning Variance Notice',
      footer: 'Zoning Variance Notice — Page 1 of 1',
      blocks: [
        { kind: 'paragraph', spans: ['Read ', { text: 'the notice', link: 'https://city.example.gov/zoning/a' }, ' for parcel one.'] },
        { kind: 'paragraph', spans: ['Read ', { text: 'the notice', link: 'https://city.example.gov/zoning/b' }, ' for parcel two.'] },
        { kind: 'figure', id: 'img-1', alt: '', label: 'parcel map' },
      ],
    },
  },
  {
    id: 'water-quality',
    title: 'Water Quality Report 2026',
    owner: 'T. Lund',
    targets: ['WCAG 2.1 AA', 'PDF/UA'],
    content: {
      title: 'Water Quality Report 2026',
      subheading: 'Annual consumer confidence report',
      header: 'Water Quality Report 2026',
      footer: 'Water Quality Report 2026 — Page 1 of 1',
      blocks: [
        { kind: 'paragraph', spans: ['The annual water quality report is available at the front desk.'] },
        { kind: 'paragraph', spans: ['Samples were collected monthly and tested for the contaminants listed below.'] },
        // Spanish done right: marked, so this clean document stays clean.
        { kind: 'paragraph', spans: [{ text: 'Para información en español, llame al 311.', lang: 'es' }] },
      ],
    },
  },
  {
    id: 'voter-deadlines',
    title: 'Voter Registration Deadlines',
    owner: 'T. Lund',
    targets: ['WCAG 2.1 AA', 'Section 508'],
    content: {
      title: 'Voter Registration Deadlines',
      subheading: 'Dates for the coming election cycle',
      header: 'Voter Registration Deadlines',
      footer: 'Voter Registration Deadlines — Page 1 of 1',
      blocks: [
        { kind: 'paragraph', spans: ['Registration closes thirty days before each election.'] },
        { kind: 'paragraph', spans: ['You can register online at the ', { text: 'state elections portal', link: 'https://elections.example.gov/register' }, '.'] },
      ],
    },
  },
];

/** Build the ProseMirror document from seed content. Findings are computed by
 *  checkDocument against this doc — never seeded alongside it. */
export function buildSeedDocument(content: DocContent): PMNode {
  const { marks: M, nodes: N } = schema;
  const blocks: PMNode[] = [
    N.heading!.create({ level: 1 }, schema.text(content.title)),
    N.paragraph!.create(null, schema.text(content.subheading, [M.fontSize!.create({ size: 13 }), M.textColor!.create({ color: '#5E6C84' })])),
  ];
  for (const block of content.blocks) {
    if (block.kind === 'heading') {
      blocks.push(N.heading!.create({ level: block.level }, block.text === '' ? undefined : schema.text(block.text)));
    } else if (block.kind === 'figure') {
      blocks.push(N.figure!.create({ id: block.id, alt: block.alt, label: block.label }));
    } else {
      const children = block.spans.map((span) => {
        const s: SeedSpan = typeof span === 'string' ? { text: span } : span;
        const marks = [];
        if (s.link) marks.push(M.link!.create({ href: s.link }));
        if (s.strong) marks.push(M.strong!.create());
        if (s.color) marks.push(M.textColor!.create({ color: s.color }));
        if (s.highlight) marks.push(M.highlight!.create({ color: s.highlight }));
        if (s.lang) marks.push(M.lang!.create({ lang: s.lang }));
        return schema.text(s.text, marks.length ? marks : undefined);
      });
      blocks.push(N.paragraph!.create(null, children));
    }
  }
  return N.doc!.create(null, blocks);
}
