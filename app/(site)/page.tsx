import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { SeverityBadge } from '../../design-system/primitives/SeverityBadge';
import { ProductPreview } from '../_site/ProductPreview';
import '../_site/landing.css';

export const metadata: Metadata = { title: 'Ada Editor — accessible document editor' };

const HEADLINE = ['The', 'accessible', 'way', 'to', 'write', 'documents.'];

const STANDARDS = [
  { label: 'WEB + DIGITAL DOCS', name: 'WCAG 2.1 AA' },
  { label: 'US FEDERAL', name: 'Section 508' },
  { label: 'TAGGED PDF', name: 'PDF/UA-1' },
  { label: 'EXPORT VALIDATION', name: 'veraPDF in CI' },
];

const DESIGN_SYSTEM = 'https://github.com/Ruckus000/ada-editor/tree/main/docs/design-system';

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

/** The public front door. The signed-in desk lives at /desk. */
export default function Page() {
  return (
    <div className="landing" data-motion="running">
      <section className="landing-hero" aria-labelledby="hero-title">
        <div className="landing-hero__bg" aria-hidden="true"><div className="landing-hero__drift landing-loop" /></div>
        <div className="landing-wrap">
          <a href="#engine" className="landing-pill landing-in" style={delay(0)}>
            <span className="landing-pill__tag">New</span>
            <span>19 WCAG rules run live<span className="landing-hide-sm"> in the editor</span></span>
            <span aria-hidden="true">→</span>
          </a>
          <h1 id="hero-title" className="landing-h1">
            {HEADLINE.map((w, i) => (
              <span key={w}><span className="landing-word" style={delay(100 + i * 70)}>{w}</span>{i < HEADLINE.length - 1 ? ' ' : ''}</span>
            ))}
          </h1>
          <p className="landing-lead landing-in" style={delay(520)}>
            Ada Editor checks against WCAG 2.1 AA as you type, cites the criterion for every finding, and never pretends a
            checker knows more than it can.
          </p>
          <div className="landing-ctas landing-in" style={delay(640)}>
            <Link href="/desk" className="ada-button ada-button--primary">Start writing<span aria-hidden="true">→</span></Link>
            <Link href="/desk" className="ada-button ada-button--secondary">Upload a .docx</Link>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section className="landing-standards" aria-label="Standards covered">
        <ul data-stagger="">
          {STANDARDS.map((s) => (
            <li key={s.name}><div className="landing-eyebrow site-mono">{s.label}</div><div className="landing-standards__name">{s.name}</div></li>
          ))}
        </ul>
      </section>

      <section className="landing-sec" aria-labelledby="features-title">
        <div className="landing-wrap">
          <p data-rv="" className="landing-kicker">Product</p>
          <h2 data-rv="" data-rv-delay="80" id="features-title" className="landing-h2" style={{ maxWidth: '18ch' }}>
            Everything you need to ship a document people can use.
          </h2>
          <ul data-stagger="" className="landing-features">
            <li>
              <div className="landing-feature__art landing-feature__art--badges">
                <SeverityBadge severity="blocker" /><SeverityBadge severity="violation" /><SeverityBadge severity="manual" />
              </div>
              <div className="landing-feature__body">
                <h3>Never colour alone</h3>
                <p>Underline shape, glyph and a text label carry severity, so it survives colour-vision deficiency and high contrast.</p>
              </div>
            </li>
            <li>
              <div className="landing-feature__art landing-feature__art--prose" aria-hidden="true">
                <div>Live <span className="landing-ul landing-ul--blocker">structure</span> checks, prose checks <span className="landing-ul landing-ul--manual">on blur</span>.</div>
              </div>
              <div className="landing-feature__body">
                <h3>A real checking engine</h3>
                <p>Nineteen WCAG rules run against the live ProseMirror document, not a canned demo.</p>
              </div>
            </li>
            <li>
              <div data-stagger="" data-kf="slide" className="landing-feature__art landing-feature__art--files site-mono" aria-hidden="true">
                <span className="landing-chip">.docx</span><span className="landing-arrow">→</span><span className="landing-chip">.html</span><span className="landing-chip">.pdf</span>
              </div>
              <div className="landing-feature__body">
                <h3>Import and export that keep structure</h3>
                <p>Tables, header rows and alt text survive the trip. Exports are tagged PDF/UA-1 and standalone HTML.</p>
              </div>
            </li>
            <li>
              <div className="landing-feature__art landing-feature__art--keys" aria-hidden="true">
                <div className="landing-key landing-key--primary"><span>Go to text</span><span className="landing-kbd site-mono">↵</span></div>
                <div className="landing-key"><span>Dismiss</span><span className="landing-kbd site-mono">⌫</span></div>
              </div>
              <div className="landing-feature__body">
                <h3>The findings list is the interface</h3>
                <p>Keyboard-first and announced to screen readers. When no safe fix exists, “Go to text” is the primary action.</p>
              </div>
            </li>
            <li>
              <div className="landing-feature__art landing-feature__art--local site-mono" aria-hidden="true">
                reading .docx in your browser<span>0 bytes uploaded</span>
              </div>
              <div className="landing-feature__body">
                <h3>Private by construction</h3>
                <p>Word files are parsed locally. Saved documents sit behind row-level security and sync after reconnect.</p>
              </div>
            </li>
            <li>
              <div data-stagger=".landing-otp" data-kf="pop" className="landing-feature__art landing-feature__art--otp site-mono" aria-hidden="true">
                {['4', '8', '2', '9', '', ''].map((d, i) => <span key={i} className="landing-otp" data-focus={i === 3 || undefined}>{d}</span>)}
              </div>
              <div className="landing-feature__body">
                <h3>Passwordless sign-in</h3>
                <p>An emailed one-time code. No passwords to create, remember or leak.</p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section id="engine" className="landing-engine" data-glass="dark" aria-labelledby="engine-title">
        <div className="landing-engine__orb landing-loop" aria-hidden="true" />
        <div className="landing-wrap landing-grid2">
          <div data-rv="">
            <p className="landing-kicker landing-kicker--dark">Engine</p>
            <h2 id="engine-title" className="landing-h2 landing-h2--dark">Findings are structured data.</h2>
            <p className="landing-body landing-body--dark">
              Each issue names its WCAG criterion, explains why it matters and points to an exact text range. That is what
              makes it listable, navigable and announceable.
            </p>
            <ul data-stagger="" data-kf="slide" className="landing-steps">
              <li><span aria-hidden="true" className="site-mono">01</span>Structure rules run on every keystroke</li>
              <li><span aria-hidden="true" className="site-mono">02</span>Prose rules run when you pause</li>
              <li><span aria-hidden="true" className="site-mono">03</span>Anything a machine can’t judge is marked for a person</li>
            </ul>
            <div className="landing-engine__cta">
              <a href={DESIGN_SYSTEM} className="ada-button ada-button--secondary">Read the design system<span aria-hidden="true">→</span></a>
            </div>
          </div>
          <div data-rv="" data-rv-delay="150" className="landing-code">
            <div className="landing-code__window">
              <div className="landing-code__bar site-mono"><span>issue.json</span><span>application/json</span></div>
              <pre data-stagger=".landing-line" data-kf="line" tabIndex={0} aria-label="Example finding as JSON" className="site-mono">
                <span className="landing-line">{'{'}</span>{'\n'}
                <span className="landing-line">  <span className="landing-k">&quot;severity&quot;</span>: <span className="landing-s">&quot;blocker&quot;</span>,</span>{'\n'}
                <span className="landing-line">  <span className="landing-k">&quot;title&quot;</span>: <span className="landing-s">&quot;Image has no alternative text&quot;</span>,</span>{'\n'}
                <span className="landing-line">  <span className="landing-k">&quot;criterion&quot;</span>: <span className="landing-s">&quot;1.1.1 Non-text Content&quot;</span>,</span>{'\n'}
                <span className="landing-line">  <span className="landing-k">&quot;from&quot;</span>: <span className="landing-n">34</span>,</span>{'\n'}
                <span className="landing-line">  <span className="landing-k">&quot;to&quot;</span>: <span className="landing-n">66</span></span>{'\n'}
                <span className="landing-line">{'}'}</span>
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section id="promise" className="landing-sec landing-promise" aria-labelledby="promise-title">
        <div className="landing-wrap landing-grid2">
          <div data-rv="">
            <p className="landing-kicker">Promise</p>
            <h2 id="promise-title" className="landing-h2" style={{ maxWidth: '15ch' }}>We will never call your document “compliant.”</h2>
            <p className="landing-body">
              Automated checks cover roughly a third of WCAG. Ada Editor flags what it can prove, marks what needs a person, and
              says so when it finds nothing.
            </p>
          </div>
          <div data-rv="" data-rv-delay="150" className="landing-empty">
            <div className="landing-empty__card">
              <div className="landing-empty__head"><span>Findings</span><span className="landing-fig__count site-mono">0 automated</span></div>
              <p>
                No issues found by automated checks. <strong>This does not confirm the document meets WCAG.</strong> Review alt
                text quality and reading order yourself.
              </p>
              <div className="landing-empty__badge"><SeverityBadge severity="manual" /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-cta" aria-labelledby="cta-title">
        <div data-rv="" className="landing-cta__card" data-glass="dark">
          <div className="landing-cta__grid landing-loop" aria-hidden="true" />
          <div className="landing-cta__inner">
            <h2 id="cta-title" className="landing-cta__title">Write it right, the first time.</h2>
            <p>Every finding cites its criterion. Every gap is marked for a person.</p>
            <div className="landing-cta__actions">
              <Link href="/desk" className="ada-button ada-button--secondary">Open the editor<span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
