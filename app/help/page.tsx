import type { Metadata } from 'next';
import Link from 'next/link';
// The files, not the barrel: index.ts also exports client hooks, and this page renders on the server.
import { SeverityBadge } from '../../design-system/primitives/SeverityBadge';
import { SEVERITY_ENCODING } from '../../design-system/primitives/severity';
import { OPEN_SEVERITIES } from '../../design-system/primitives/openSeverity';
import { RULES } from '../_engine/rules';
import { pageMetadata } from '../_site/pages';
import { Site, Toc } from '../_site/Site';
import { TourReplay } from '../_tour/TourReplay';

export const metadata: Metadata = pageMetadata('/help');

/* Every check's text comes from the rules registry (app/_engine/rules.ts), the
 * same words a finding's "Learn more" points at, so Help can't drift from what
 * the editor actually checks. */

const WHAT_IT_MEANS: Record<(typeof OPEN_SEVERITIES)[number], string> = {
  blocker: 'Some readers can’t get the content at all. Fix these before you publish.',
  violation: 'The document doesn’t meet WCAG 2.1 AA, the standard most rules and contracts require.',
  advisory: 'Not a failure, but fixing it makes the document easier for everyone. Mostly AAA checks and plain-language advice.',
  manual: 'A machine can’t decide: is this alt text accurate? Is this paragraph in Spanish? You make the call.',
};

const GROUPS: [string, string, string[]][] = [
  ['images', 'Images', ['img-alt-missing', 'img-alt-suspicious', 'img-long-description']],
  ['links', 'Links', ['link-text-generic', 'link-text-raw-url', 'link-text-ambiguous']],
  ['structure', 'Headings and structure', ['document-no-headings', 'document-no-h1', 'heading-skip', 'heading-empty']],
  ['language', 'Language and reading', ['document-language', 'language-of-parts', 'reading-level', 'long-sentence']],
  ['colour', 'Colour and contrast', ['contrast-minimum', 'colour-only-reference']],
  ['tables', 'Tables and forms', ['table-no-header', 'table-merged-cells', 'form-blank']],
];

const KEYS: [string, string][] = [
  ['Ctrl/⌘ B, I, U', 'Bold, italic, underline'],
  ['Ctrl/⌘ Z', 'Undo'],
  ['Ctrl/⌘ Shift Z, or Ctrl/⌘ Y', 'Redo'],
  ['Ctrl/⌘ ] and [', 'Indent and outdent'],
  ['F6', 'Move between the toolbar, the document and the findings'],
  ['Tab (in a table)', 'Next cell. Press Escape, then Tab, to leave the table'],
  ['Ctrl/⌘ K (on your desk)', 'Find a document'],
];

export default function Page() {
  const byId = new Map(RULES.map((r) => [r.id, r]));
  return (
    <Site current="help">
      <section className="site-page-hero" aria-labelledby="page-title">
        <div className="site-wrap">
          <p className="site-eyebrow">Help</p>
          <h1 id="page-title">How Ada Editor works, and what each finding means.</h1>
          <p className="site-lede">Write or import a document, and Ada Editor checks it against WCAG 2.1 AA and Section 508 as you go. This page explains every check in plain words, and how to fix what it finds.</p>
        </div>
      </section>

      <div className="site-wrap site-statement">
        <Toc items={[['start', 'Getting started'], ['severities', 'What the findings mean'], ['checks', 'Every check'], ['keys', 'Keyboard shortcuts'], ['export', 'Exporting'], ['posting', 'Posting to an agenda system'], ['display', 'Display settings'], ['contact', 'Still stuck?']]} />
        <div className="site-col">
          <section id="start" aria-labelledby="start-title">
            <h2 id="start-title">Getting started</h2>
            <ol>
              <li><strong>Start a document.</strong> On your desk, choose New document, then start on a blank page or import a Word file (.docx). The file is read in your browser and never uploaded.</li>
              <li><strong>Write.</strong> Structure checks run as you type; wording checks (reading level, link text, colour words) run when you leave the page or choose Recheck.</li>
              <li><strong>Work through the findings.</strong> They’re listed beside the page, most serious first. Each says what’s wrong, why it matters and which WCAG criterion it comes from. Go to text takes you to it; Apply fix appears when the fix is certain.</li>
              <li><strong>Export.</strong> When you’re done, Export saves a web page or a tagged PDF.</li>
            </ol>
            <p>Prefer to be shown? The tour points out each part of your desk and the editor. <TourReplay /></p>
          </section>

          <section id="severities" aria-labelledby="sev-title">
            <h2 id="sev-title">What the findings mean</h2>
            <p>Every finding has a label, a shape and an underline style, so you never need to tell colours apart.</p>
            <dl className="site-defs">
              {OPEN_SEVERITIES.map((s) => (
                <div key={s}>
                  <dt><SeverityBadge severity={s} /> <span className="site-defs__wcag">{SEVERITY_ENCODING[s].wcag}</span></dt>
                  <dd>{WHAT_IT_MEANS[s]}</dd>
                </div>
              ))}
            </dl>
            <p>No findings doesn’t mean a document is accessible. Automated checks cover roughly a third of WCAG; whether alt text is accurate, or headings match the real structure, still needs a person.</p>
          </section>

          <section id="checks" aria-labelledby="checks-title">
            <h2 id="checks-title">Every check</h2>
            {GROUPS.map(([id, label, ids]) => (
              <section key={id} aria-labelledby={`group-${id}`}>
                <h3 id={`group-${id}`}>{label}</h3>
                {ids.map((rid) => {
                  const r = byId.get(rid)!;
                  return (
                    <article key={r.id} id={`rule-${r.id}`} className="site-rule" aria-labelledby={`rule-${r.id}-name`}>
                      <h4 id={`rule-${r.id}-name`}>{r.name}</h4>
                      <p className="site-rule__crit">{`WCAG ${r.criterion} (Level ${r.level})`}</p>
                      <p>{r.about}</p>
                      <p><strong>How to fix it: </strong>{r.fix}</p>
                    </article>
                  );
                })}
              </section>
            ))}
          </section>

          <section id="keys" aria-labelledby="keys-title">
            <h2 id="keys-title">Keyboard shortcuts</h2>
            <p>Everything in Ada Editor works from the keyboard. These save time:</p>
            <div className="site-table" role="region" aria-labelledby="keys-title" tabIndex={0}>
              <table>
                <thead><tr><th scope="col">Keys</th><th scope="col">What they do</th></tr></thead>
                <tbody>{KEYS.map(([k, what]) => <tr key={k}><th scope="row">{k}</th><td>{what}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section id="export" aria-labelledby="export-title">
            <h2 id="export-title">Exporting</h2>
            <p><strong>Export HTML</strong> saves a standalone web page: the language, headings, links, tables and images with their alt text. <strong>Export PDF</strong> saves a tagged PDF (PDF/UA-1) built from the same structure.</p>
            <p>Exports keep the document as it is. Whatever the checker flags is still wrong in the export: an image without alt text is exported without it. The PDF’s font covers Latin scripts only; a document with Greek, Cyrillic, Hebrew, Arabic or CJK text is refused for PDF (with the characters listed), and Export HTML keeps every script.</p>
          </section>

          <section id="posting" aria-labelledby="posting-title">
            <h2 id="posting-title">Posting a PDF to your agenda system</h2>
            <p>Agenda systems change files as they publish them. We tested the ones Florida towns use, and the tags a screen reader relies on survived on some paths and not others.</p>
            <ul>
              <li><strong>Upload the PDF, not the Word file.</strong> Agenda systems convert Word files themselves, and most of the conversions we tested lost the headings and tables.</li>
              <li><strong>Link people to the document itself.</strong> Many systems also combine every item into one agenda packet. In our tests the packet usually lost the tags or the document’s language, while the document’s own link kept them.</li>
              <li><strong>If your system publishes only a packet,</strong> post the PDF on your website as well, and link to it from the agenda.</li>
            </ul>
            <p>Want to know whether a posted copy kept its structure? Signed in, you can <Link href="/privacy#contact">ask us to check a posted copy</Link> against the original.</p>
          </section>

          <section id="display" aria-labelledby="display-title">
            <h2 id="display-title">Display settings</h2>
            <p>Choose a light or dark theme, or match your device, and one of four text sizes: <strong>Display</strong> in the account menu, or at the top of these pages. Signed in, your choice follows you to your other devices. The document page stays white in the dark theme, because colours in a document are checked against white. Exports aren’t affected.</p>
          </section>

          <section id="contact" aria-labelledby="contact-title">
            <h2 id="contact-title">Still stuck?</h2>
            <p>Signed in, you can send us a message from the <Link href="/privacy#contact">contact form</Link>. If something in Ada Editor itself gets in your way, the <Link href="/accessibility#feedback">accessibility statement</Link> says how to report it.</p>
          </section>
        </div>
      </div>
    </Site>
  );
}
