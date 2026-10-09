import type { Metadata } from 'next';
import Link from 'next/link';
// The file, not the barrel: index.ts also exports client hooks, and this page renders on the server.
import { SeverityBadge } from '../../design-system/primitives/SeverityBadge';
import { pageMetadata } from '../_site/pages';
import { Site, Toc } from '../_site/Site';

export const metadata: Metadata = pageMetadata('/accessibility');

/* Every claim here has a check or a line of code behind it: the gates in
 * scripts/verify-a11y-app.mjs and verify-a11y.mjs, verify-pdf.mjs (veraPDF),
 * .github/workflows/screen-reader.yml, and the engine's own rules. Keep it
 * that way: no testing we don't run, no promise we can't keep. */

const BUILT_IN = [
  ['Keyboard first', 'Every action, including every finding, is reachable and operable without a pointer. Focus is always visible.'],
  ['Announced to screen readers', 'One live region reports what the editor did — a fix applied, a finding dismissed, an export finished — so nothing changes silently.'],
  ['Never colour alone', 'Severity is carried by underline shape, glyph and a visible text label.'],
  ['High contrast aware', 'Windows forced colours are respected. We don’t override your system palette.'],
  ['Reduced motion honoured', 'If your system asks for less motion, transitions stop.'],
  ['Readable at any size', 'Body text never drops below 16px, and pages reflow at 320 CSS pixels (400% zoom) without sideways scrolling.'],
];

export default function Page() {
  return (
    <Site current="accessibility">
      <section className="site-page-hero" aria-labelledby="page-title">
        <div className="site-wrap">
          <p className="site-eyebrow">Accessibility statement</p>
          <h1 id="page-title">Accessibility is the product. We hold the product to it.</h1>
          <p className="site-lede">This statement covers the Ada Editor web app and the documents it exports. It says where we meet WCAG 2.1 AA, where we don’t yet, and how to reach a person when something gets in your way.</p>
          <dl className="site-facts">
            <div><dt>Target</dt><dd>WCAG 2.1 AA</dd></div>
            <div><dt>Status</dt><dd>Partially conformant</dd></div>
            <div><dt>Last reviewed</dt><dd><time dateTime="2026-10-06">6 October 2026</time></dd></div>
          </dl>
        </div>
      </section>

      <div className="site-wrap site-statement">
        <Toc items={[['status', 'Conformance status'], ['built-in', 'What’s built in'], ['limitations', 'Known limitations'], ['testing', 'How we test'], ['feedback', 'Report a barrier']]} />
        <div className="site-col">
          <section id="status" aria-labelledby="status-title">
            <h2 id="status-title">Conformance status</h2>
            <p>“Partially conformant” means some parts of the app do not fully meet the standard yet. We list those parts below instead of rounding up.</p>
            <div className="site-table" role="region" aria-labelledby="status-title" tabIndex={0}>
              <table>
                <thead><tr><th scope="col">Standard</th><th scope="col">Applies to</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  <tr><th scope="row">WCAG 2.1 AA</th><td>Editor app</td><td>Partially conforms</td></tr>
                  <tr><th scope="row">Section 508</th><td>Editor app</td><td>Partially conforms</td></tr>
                  <tr><th scope="row">PDF/UA-1</th><td>Exported PDFs</td><td>Validated with veraPDF in CI</td></tr>
                  <tr><th scope="row">WCAG 2.2 · 2.5.8 Target Size</th><td>Buttons</td><td>24px minimum built into every button</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="built-in" aria-labelledby="built-title">
            <h2 id="built-title">What’s built in</h2>
            <p>These aren’t settings you turn on. They are how the editor works for everyone.</p>
            <ul className="site-grid">
              {BUILT_IN.map(([title, body]) => <li key={title}><h3>{title}</h3><p>{body}</p></li>)}
            </ul>
          </section>

          <section id="limitations" aria-labelledby="lim-title">
            <h2 id="lim-title">Known limitations</h2>
            <p>Written with the same severity labels the editor uses for your documents.</p>
            <ul className="site-limits">
              <li>
                <div><SeverityBadge severity="manual" /><span className="site-small">1.1.1 Non-text Content</span></div>
                <h3>We can check that alt text exists, not that it’s good</h3>
                <p>Whether a description is accurate and useful needs a person. The editor flags what it can spot, like alt text that only says it’s an image.</p>
              </li>
              <li>
                <div><SeverityBadge severity="advisory" /><span className="site-small">1.3.1 Info and Relationships</span></div>
                <h3>Tables with merged cells can’t be fully linked to their headers</h3>
                <p>The editor flags them. If you can, split merged cells or break the table into simpler tables; otherwise check it with a screen reader.</p>
              </li>
              <li>
                <div><SeverityBadge severity="advisory" /><span className="site-small">3.1.5 Reading Level</span></div>
                <h3>Reading-level and word checks are English only</h3>
                <p>Rules that rely on English words and syllables run only on documents set to English.</p>
              </li>
              <li>
                <div><SeverityBadge severity="advisory" /><span className="site-small">PDF/UA-1</span></div>
                <h3>PDF export covers Latin scripts only</h3>
                <p>A document with Greek, Cyrillic, Hebrew, Arabic or CJK text is not exported as PDF, rather than exported with missing characters. Export HTML works for every language.</p>
              </li>
            </ul>
          </section>

          <section id="testing" aria-labelledby="test-title">
            <h2 id="test-title">How we test</h2>
            <div className="site-boxes">
              <div>
                <h3>On every change</h3>
                <ul>
                  <li>axe-core on the components and every app screen</li>
                  <li>Keyboard, reflow and forced-colours checks</li>
                  <li>veraPDF validation of exported PDFs</li>
                </ul>
              </div>
              <div>
                <h3>Screen readers in CI</h3>
                <ul>
                  <li>NVDA on Windows</li>
                  <li>VoiceOver on macOS</li>
                  <li>Run against the design-system components</li>
                </ul>
              </div>
            </div>
          </section>

          <section id="feedback" aria-labelledby="fb-title">
            <div className="site-contact">
              <h2 id="fb-title">If something blocks you, tell a person.</h2>
              <p>Describe what you were trying to do and what you use to browse. Messages go to the team that builds Ada Editor.</p>
              {/* ponytail: the form needs an account; add a monitored address here before announcing this statement */}
              <Link href="/privacy#contact" className="ada-button ada-button--primary">Send us a message</Link>
            </div>
          </section>
        </div>
      </div>
    </Site>
  );
}
