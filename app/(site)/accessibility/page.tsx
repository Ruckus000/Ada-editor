import type { Metadata } from 'next';
import Link from 'next/link';
import { SeverityBadge } from '../../../design-system/primitives/SeverityBadge';
import { PageSection, SitePage } from '../../_site/SitePage';

export const metadata: Metadata = { title: 'Accessibility statement · Ada Editor' };

const TOC = [
  { id: 'status', label: 'Conformance status' },
  { id: 'built-in', label: 'What’s built in' },
  { id: 'limitations', label: 'Known limitations' },
  { id: 'testing', label: 'How we test' },
  { id: 'feedback', label: 'Report a barrier' },
];

/**
 * Every claim here is one the repo can show: the CI gates
 * (scripts/verify-a11y-app.mjs, verify-pdf.mjs, verify-tokens.mjs, the
 * screen-reader workflow) and the limits the README lists. Keep it that way:
 * an accessibility statement that overstates is worse than none.
 *
 * "Report a barrier" goes to /contact, which needs no account. No reply time
 * is promised: messages are read by hand. If the app is ever audited
 * independently, update the status and the date.
 */
export default function Page() {
  return (
    <SitePage
      eyebrow="Accessibility statement"
      title="Accessibility is the product. We hold the product to it."
      tint="violet"
      toc={TOC}
      lead="This statement covers the Ada Editor web app and the documents it exports. It says what we check, what we know falls short, and how to tell us when something gets in your way."
      heroExtra={
        <dl data-stagger="" className="page-facts">
          <div><dt>Target</dt><dd>WCAG 2.1 AA</dd></div>
          <div><dt>Status</dt><dd>Self-assessed, not yet independently audited</dd></div>
          <div><dt>Last reviewed</dt><dd><time dateTime="2026-09-30">30 September 2026</time></dd></div>
        </dl>
      }
    >
      <PageSection id="status" title="Conformance status">
        <p data-rv="">
          We check the app against these standards on every change, and we haven’t had it audited by anyone outside the team
          yet. Where something falls short and we know it, it’s listed below instead of rounded up.
        </p>
        <div data-rv="" className="page-table" role="region" aria-label="Conformance by standard" tabIndex={0}>
          <table role="table">
            <thead role="rowgroup">
              <tr role="row"><th role="columnheader" scope="col">Standard</th><th role="columnheader" scope="col">Applies to</th><th role="columnheader" scope="col">How it’s checked</th></tr>
            </thead>
            <tbody role="rowgroup">
              <tr role="row"><th role="rowheader" scope="row">WCAG 2.1 AA</th><td role="cell" data-label="Applies to">The editor app</td><td role="cell" data-label="How it’s checked">Automated and keyboard checks on every screen</td></tr>
              <tr role="row"><th role="rowheader" scope="row">Section 508</th><td role="cell" data-label="Applies to">The editor app</td><td role="cell" data-label="How it’s checked">Incorporates WCAG 2.0 AA, covered by the checks above</td></tr>
              <tr role="row"><th role="rowheader" scope="row">PDF/UA-1</th><td role="cell" data-label="Applies to">Exported PDFs</td><td role="cell" data-label="How it’s checked">Sample exports validated with veraPDF in CI</td></tr>
              <tr role="row"><th role="rowheader" scope="row">WCAG 2.2 · 2.5.8 Target Size</th><td role="cell" data-label="Applies to">Every control</td><td role="cell" data-label="How it’s checked">24px minimum, checked on every screen</td></tr>
            </tbody>
          </table>
        </div>
      </PageSection>

      <PageSection id="built-in" title="What’s built in">
        <p data-rv="">These aren’t settings you turn on. They are how the editor works for everyone.</p>
        <ul data-stagger="" className="page-grid">
          <li><h3>Keyboard first</h3><p>Every action, including every finding, works without a pointer, and focus is always visible.</p></li>
          <li><h3>Announced to screen readers</h3><p>One live region reports each applied or dismissed finding, so nothing changes silently.</p></li>
          <li><h3>Never colour alone</h3><p>Severity is carried by underline shape, glyph and a visible text label.</p></li>
          <li><h3>High contrast aware</h3><p>Windows forced colours are respected. We don’t override your system palette.</p></li>
          <li><h3>Reduced motion honoured</h3><p>If your system asks for less motion, animation stops. Anything that moves on its own can be paused.</p></li>
          <li><h3>Readable at any size</h3><p>Body text never drops below 16px, and screens reflow at 320px wide (400% zoom) without sideways scrolling.</p></li>
        </ul>
      </PageSection>

      <PageSection id="limitations" title="Known limitations">
        <p data-rv="">We list these in the open, using the same severity labels the editor uses for your documents.</p>
        <ul data-stagger="" className="page-issues">
          <li>
            <div className="page-issues__meta"><SeverityBadge severity="manual" /><span className="page-issues__crit">1.1.1 Non-text Content</span></div>
            <h3>We can check that alt text exists, not that it’s good</h3>
            <p>Whether a description is accurate and useful needs a person. The editor asks you to review it rather than passing it.</p>
          </li>
          <li>
            <div className="page-issues__meta"><SeverityBadge severity="advisory" /><span className="page-issues__crit">1.3.1 Info and Relationships</span></div>
            <h3>Some Word content can’t come across yet</h3>
            <p>
              Footnotes, decorative images, tables nested inside table cells, and pictures in formats a browser can’t draw
              (such as EMF/WMF) aren’t imported. They are listed on the document instead of dropped silently.
            </p>
          </li>
          <li>
            <div className="page-issues__meta"><SeverityBadge severity="advisory" /><span className="page-issues__crit">3.1.5 Reading Level</span></div>
            <h3>Prose checks understand English only</h3>
            <p>Rules that rely on English word lists and syllables run only on English documents.</p>
          </li>
          <li>
            <div className="page-issues__meta"><SeverityBadge severity="advisory" /><span className="page-issues__crit">PDF/UA-1</span></div>
            <h3>PDF export covers Latin scripts only</h3>
            <p>
              A document with Greek, Cyrillic, Hebrew, Arabic or CJK text is refused with the characters listed, never drawn as
              empty boxes. <strong>Workaround:</strong> use Export HTML.
            </p>
          </li>
        </ul>
      </PageSection>

      <PageSection id="testing" title="How we test">
        <div className="page-cards page-cards--sunken">
          <div data-rv="">
            <h3>On every change</h3>
            <ul>
              <li>axe-core on every app screen, and again with forced colours on</li>
              <li>A keyboard walk of each screen: every stop takes focus visibly</li>
              <li>Reflow at 320px wide</li>
              <li>veraPDF validation of exported PDFs</li>
            </ul>
          </div>
          <div data-rv="" data-rv-delay="100">
            <h3>Screen readers</h3>
            <ul>
              <li>NVDA on Windows and VoiceOver on macOS, in CI, on the design-system components</li>
              <li>Orca on Linux, run by hand</li>
            </ul>
          </div>
        </div>
      </PageSection>

      <section id="feedback" className="page-sec" aria-labelledby="feedback-title">
        <div data-rv="" className="page-callout">
          <h2 id="feedback-title" className="page-h2">If something blocks you, tell a person.</h2>
          <p>Describe what you were trying to do and what you use to browse. You don’t need an account to write to us.</p>
          <div className="page-callout__actions">
            <Link href="/contact" className="site-glass-link">Contact us</Link>
          </div>
        </div>
      </section>
    </SitePage>
  );
}
