/**
 * What the real screen readers are recorded reading, for the "Hear it as a
 * screen reader" simulation (app/_editor/screenReader.ts). Pure: the NVDA and
 * VoiceOver specs load these pages, and scripts/verify-rules.mjs holds the
 * simulator to the recordings of them.
 *
 * The reading pack has one of each thing exportHtml emits, so a recording is
 * known by construction. The agenda is the clerk walkthrough's real export.
 * Grow either one reproducer at a time: a construct read wrongly in the
 * dialog becomes a line here, then a re-recording.
 */
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '../../app/_editor/editorSchema';
import { exportHtml } from '../../app/_editor/exportHtml';

/** Recordings live at tests/screen-reader/recordings/<reader>/<name>.txt. */
export const READING_FIXTURES = ['reading-pack', 'agenda'] as const;
export type ReadingFixture = (typeof READING_FIXTURES)[number];

/** Relative to the repo root. */
export const AGENDA_EXPORT = 'docs/audit/clerk-walkthrough-2026-10/agenda-export.html';

/**
 * Text as compared with a recording: lowercase words only. Guidepup joins one
 * NVDA utterance's parts with ", " and utterances with ". ", so punctuation
 * says nothing about what was heard.
 */
export const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** A recording's text: one spoken phrase per line; lines starting with # are notes. */
export const recordingText = (file: string) =>
  file.split('\n').filter((l) => l.trim() && !l.startsWith('#')).join(' ');

const N = schema.nodes;
const M = schema.marks;
const KEY = 'a'.repeat(64);
// A 1×1 PNG: real exports carry their pictures as data: URIs too.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

type Inline = string | PMNode;
const inline = (c: Inline) => (typeof c === 'string' ? schema.text(c) : c);
const p = (...children: Inline[]) => N.paragraph!.create(null, children.map(inline));
const h = (level: number, s: string) => N.heading!.create({ level }, s ? schema.text(s) : undefined);
const a = (href: string, s: string) => schema.text(s, [M.link!.create({ href })]);
const li = (...blocks: PMNode[]) => N.list_item!.create(null, blocks);
type Cell = string | { th: string } | { td: string; colspan?: number; rowspan?: number };
const cell = (c: Cell) => typeof c === 'string'
  ? N.table_cell!.create(null, p(...(c ? [c] : [])))
  : 'th' in c ? N.table_header!.create(null, p(c.th)) : N.table_cell!.create({ colspan: c.colspan ?? 1, rowspan: c.rowspan ?? 1 }, p(c.td));
const es = (s: string) => schema.text(s, [M.lang!.create({ lang: 'es' })]);
const table = (rows: Cell[][], caption = '') => N.table!.create({ caption }, rows.map((r) => N.table_row!.create(null, r.map(cell))));

const pack = N.doc!.create({ lang: 'en' }, [
  h(1, 'Reading test'),
  p('A paragraph with a link to ', a('https://example.org/agenda', 'the agenda'), '.'),
  p('Line one', N.hard_break!.create(), 'line two.'),
  p(),
  p(schema.text('Important', [M.strong!.create()]), ', ', schema.text('stressed', [M.em!.create()]), ' and ', schema.text('highlighted', [M.highlight!.create({ color: '#fff3a3' })]), ' words.'),
  h(2, 'Lists'),
  N.bullet_list!.create(null, [li(p('Apples')), li(p('Pears'), N.bullet_list!.create(null, [li(p('Green'), N.bullet_list!.create(null, [li(p('Light'))])), li(p('Red'))]))]),
  N.ordered_list!.create({ order: 3 }, [li(p('Third')), li(p('Fourth'))]),
  h(2, ''),
  h(3, 'Tables'),
  table([[{ th: 'Item' }, { th: 'Amount' }], [{ th: 'Budget' }, '100'], [{ th: 'Spent' }, '80']], 'Park fund'),
  table([[{ th: 'Member' }, { th: 'Vote' }], [{ td: 'Consent agenda', colspan: 2 }], [{ td: 'Mayor', rowspan: 2 }, 'Yes'], ['No']]),
  table([['Name:', ''], ['Date:', ''], ['Signed:', '']]),
  h(2, 'Pictures'),
  N.figure!.create({ id: 'img-1', alt: 'Map of the park', label: 'map', image: KEY, width: 120, height: 80 }),
  N.figure!.create({ id: 'img-2', alt: '', label: 'image', image: KEY, width: 120, height: 80 }),
  // No picture to hand: the placeholders the sample documents are made of.
  N.figure!.create({ id: 'img-3', alt: 'Site plan of the shelter', label: 'site plan' }),
  N.figure!.create({ id: 'img-4', alt: '', label: 'chart' }),
  h(2, 'Links and language'),
  p(a('javascript:void(0)', 'An unsafe link'), '.'),
  p('Web address: ', a('https://example.org/agenda', 'https://example.org/agenda')),
  p('In Spanish: ', es('Llame al 311.')),
  p('Say ', es('hola'), ' to the clerk.'),
  p('Parks & Recreation: 1.5 miles, 50% off, call #3 or write to clerk@example.org.'),
  p('Name: ________'),
]);

/** The reading pack exported, built into `dom` (an empty HTML document). */
export function readingPack(dom: Document): string {
  return exportHtml(
    pack,
    {
      title: 'Reading test',
      header: 'Town of Example',
      footer: 'Posted October 2026',
      headerImage: { alt: 'Town seal', image: KEY, width: 120, height: 80 },
    },
    dom,
    new Map([[KEY, { src: PNG }]]),
  );
}
