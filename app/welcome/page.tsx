import type { Metadata } from 'next';
import Link from 'next/link';
// The file, not the barrel: index.ts also exports client hooks, and this page renders on the server.
import { SeverityBadge } from '../../design-system/primitives/SeverityBadge';
import { START, Site } from '../_site/Site';

export const metadata: Metadata = {
  title: 'Accessible document editor · Ada Editor',
  description: 'Ada Editor checks documents against WCAG 2.1 AA as you write, cites the criterion for every finding, and marks what a person has to check.',
};

/* Copy is held to what the code does: 19 rules (rules.ts, 3 of them AAA, so
 * never "19 AA rules"); prose rules run on blur, not on a pause; codes are 8
 * digits. Public, server-rendered, no client JS. */

const FINDINGS = [
  { severity: 'blocker', title: 'Image has no alternative text', criterion: '1.1.1 Non-text Content' },
  { severity: 'violation', title: 'Link text is not descriptive', criterion: '2.4.4 Link Purpose' },
  { severity: 'advisory', title: 'Reading level is high', criterion: '3.1.5 Reading Level' },
] as const;

const STANDARDS = [
  ['Web + digital docs', 'WCAG 2.1 AA'],
  ['US federal', 'Section 508'],
  ['Tagged PDF', 'PDF/UA-1'],
  ['Export validation', 'veraPDF in CI'],
];

export default function Page() {
  return (
    <Site>
      <section className="site-hero" aria-labelledby="hero-title">
        <div className="site-hero__intro">
          <a href="#engine" className="site-pill site-in"><span className="site-pill__tag">New</span>19 WCAG rules run live in the editor<span aria-hidden="true">→</span></a>
          <h1 id="hero-title" className="site-in" style={{ animationDelay: '80ms' }}>The accessible way to write documents.</h1>
          <p className="site-hero__lede site-in" style={{ animationDelay: '200ms' }}>
            Ada Editor checks against WCAG 2.1 AA as you type, cites the criterion for every finding, and never pretends a checker knows more than it can.
          </p>
          <div className="site-actions site-in" style={{ animationDelay: '300ms' }}>
            <Link href={START} className="ada-button ada-button--primary">Write your first document</Link>
            <Link href={START} className="ada-button ada-button--secondary">Upload a .docx</Link>
            {/* ponytail: both go to sign-in; add an ?import deep link if the upload CTA should open the picker */}
          </div>
        </div>

        <figure id="product" className="site-figure site-in" style={{ animationDelay: '400ms' }} aria-label="Product preview: a document with three underlined problems and a matching list of findings">
          <div className="site-figure__bar" aria-hidden="true">
            <span className="site-mono">q3-community-update.docx</span>
            <span className="site-mono site-figure__status">Checked</span>
            <span className="site-mono site-figure__tag">WCAG 2.1 AA</span>
          </div>
          <div className="site-figure__grid">
            <div className="site-doc">
              <p className="site-doc__title">Q3 Community Update</p>
              <p>Enrollment grew across every district. <span className="ada-underline site-doc__active" data-severity="blocker">[chart of enrollment]</span> shows the trend. For the full report, <span className="ada-underline" data-severity="violation">click here</span>.</p>
              <p>Our <span className="ada-underline" data-severity="advisory">multifaceted programmatic engagement paradigm</span> continues.</p>
            </div>
            <div className="site-findings">
              <p className="site-findings__head"><span>Findings</span><span className="site-count">3</span></p>
              <ul>
                {FINDINGS.map((f, i) => (
                  <li key={f.title} className={i === 0 ? 'site-finding site-finding--active' : 'site-finding'}>
                    <SeverityBadge severity={f.severity} />
                    <span className="site-finding__title">{f.title}</span>
                    <span className="site-mono">{f.criterion}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </figure>
      </section>

      <section aria-label="Standards covered" className="site-wrap">
        <ul className="site-standards">
          {STANDARDS.map(([label, name]) => (
            <li key={name}><span className="site-label">{label}</span><span className="site-standards__name">{name}</span></li>
          ))}
        </ul>
      </section>

      <section className="site-section site-wrap" aria-labelledby="features-title">
        <p className="site-eyebrow">Product</p>
        <h2 id="features-title" className="site-h2">Everything you need to ship a document people can use.</h2>
        <ul className="site-cards">
          <li className="site-card">
            <div className="site-card__art" aria-hidden="true">
              <SeverityBadge severity="blocker" /><SeverityBadge severity="violation" /><SeverityBadge severity="manual" />
            </div>
            <h3>Never colour alone</h3>
            <p>Underline shape, glyph and a text label carry severity, so it survives colour-vision deficiency and high contrast.</p>
          </li>
          <li className="site-card">
            <div className="site-card__art site-doc" aria-hidden="true">
              <p>Live <span className="ada-underline" data-severity="blocker">structure</span> checks, prose checks <span className="ada-underline" data-severity="manual">on blur</span>.</p>
            </div>
            <h3>A real checking engine</h3>
            <p>Nineteen WCAG rules run against the live ProseMirror document, not a canned demo.</p>
          </li>
          <li className="site-card">
            <div className="site-card__art site-mono" aria-hidden="true">
              <span className="site-chip">.docx</span>→<span className="site-chip">.html</span><span className="site-chip">.pdf</span>
            </div>
            <h3>Import and export that keep structure</h3>
            <p>Tables, header rows and alt text survive the trip. Exports are tagged PDF/UA-1 and standalone HTML.</p>
          </li>
          <li className="site-card">
            <div className="site-card__art site-card__art--stack" aria-hidden="true">
              <span className="site-chip site-chip--primary">Go to text</span><span className="site-chip">Dismiss</span>
            </div>
            <h3>The findings list is the interface</h3>
            <p>Keyboard-first and announced to screen readers. When no safe fix exists, “Go to text” is the primary action.</p>
          </li>
          <li className="site-card">
            <div className="site-card__art site-card__art--stack site-mono" aria-hidden="true">
              <span>reading .docx in your browser</span><strong>0 bytes uploaded</strong>
            </div>
            <h3>Private by construction</h3>
            <p>Word files are read on your device. Saved documents sit behind row-level security and sync after you reconnect.</p>
          </li>
          <li className="site-card">
            <div className="site-card__art site-mono" aria-hidden="true">
              {['4', '8', '2', '9', '1', '', '', ''].map((d, i) => <span key={i} className={i === 5 ? 'site-otp site-otp--next' : 'site-otp'}>{d}</span>)}
            </div>
            <h3>Passwordless sign-in</h3>
            <p>An emailed one-time code. No passwords to create, remember or leak.</p>
          </li>
        </ul>
      </section>

      <section id="engine" className="site-engine" aria-labelledby="engine-title">
        <div className="site-wrap site-split">
          <div>
            <p className="site-eyebrow">Engine</p>
            <h2 id="engine-title" className="site-h2">Findings are structured data.</h2>
            <p className="site-lede">Each issue names its WCAG criterion, explains why it matters and points to an exact text range. That is what makes it listable, navigable and announceable.</p>
            <ol className="site-steps">
              <li>Structure rules run on every keystroke</li>
              <li>Prose rules run when you leave the text</li>
              <li>Anything a machine can’t judge is marked for a person</li>
            </ol>
          </div>
          <div className="site-code">
            <p className="site-code__bar site-mono" aria-hidden="true"><span>issue.json</span><span>application/json</span></p>
            <pre tabIndex={0} aria-label="Example finding as JSON">{`{
  "severity": "blocker",
  "title": "Image has no alternative text",
  "criterion": "1.1.1 Non-text Content",
  "from": 34,
  "to": 66
}`}</pre>
          </div>
        </div>
      </section>

      <section id="promise" className="site-section site-wrap site-split" aria-labelledby="promise-title">
        <div>
          <p className="site-eyebrow">Promise</p>
          <h2 id="promise-title" className="site-h2">We will never call your document “compliant.”</h2>
          <p className="site-lede">Automated checks cover roughly a third of WCAG. Ada Editor flags what it can prove, marks what needs a person, and says so when it finds nothing.</p>
        </div>
        <div className="site-panel">
          <p className="site-findings__head"><span>Findings</span><span className="site-count">0 automated</span></p>
          <p>No issues found by automated checks. <strong>This does not confirm the document meets WCAG.</strong> Review alt text quality and reading order yourself.</p>
          <SeverityBadge severity="manual" />
        </div>
      </section>

      <section className="site-section site-wrap" aria-labelledby="cta-title">
        <div className="site-cta">
          <h2 id="cta-title">Write it right, the first time.</h2>
          <p>Every finding cites its criterion. Every gap is marked for a person.</p>
          <Link href={START} className="ada-button ada-button--secondary">Open the editor</Link>
        </div>
      </section>
    </Site>
  );
}
