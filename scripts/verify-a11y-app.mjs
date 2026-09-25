#!/usr/bin/env node
/**
 * Accessibility gate for the app screens (Dashboard, Editor).
 *
 * verify-a11y.mjs gates the design-system primitives through the preview
 * harness. That says nothing about the screens built from them: layout,
 * landmarks, headings, reflow and the screen-level interactions only exist
 * here. This builds the Next app, serves it, and checks each route in real
 * Chromium over CDP — the same plumbing and the same standard as the
 * primitives gate.
 *
 *   node scripts/verify-a11y-app.mjs [--verbose] [--no-build]
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { CHROME, connect, evaluate, key, launch, shutdown, sleep, track, watchdog } from './cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!CHROME) { console.error('No Chromium found. Set CHROME_PATH.'); process.exit(1); }
const AXE = readFileSync(resolve(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const NEXT = resolve(ROOT, 'node_modules/.bin/next');
const VERBOSE = process.argv.includes('--verbose');

const failures = [];
const notes = [];
let page = '';
const fail = (m) => failures.push(`[${page}] ${m}`);
const note = (m) => notes.push(`  ok  [${page}] ${m}`);

/* ---------- serve the app ---------- */

if (!process.argv.includes('--no-build')) {
  const built = spawnSync(NEXT, ['build'], { cwd: ROOT, stdio: VERBOSE ? 'inherit' : 'pipe', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  if (built.status !== 0) {
    console.error('next build failed\n' + (built.stderr?.toString() ?? '') + (built.stdout?.toString() ?? ''));
    process.exit(1);
  }
}

const freePort = () => new Promise((res) => {
  const srv = createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => res(port)); });
});

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const server = track(spawn(NEXT, ['start', '-p', String(port), '-H', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } }));

// A hung browser must fail the gate, not stall it forever, and must not leave
// `next start` or Chrome running behind it — both are tracked, so the watchdog
// and a signal kill take them down. (`next build` above blocks timers, so the
// clock starts here.)
watchdog(8 * 60_000);

let up = false;
for (let i = 0; i < 100 && !up; i++) {
  await sleep(200);
  try { up = (await fetch(origin)).ok; } catch { /* not yet */ }
}
if (!up) { server.kill(); console.error('next start did not come up'); process.exit(1); }

/* ---------- shared checks ---------- */

const INTERACTIVE = new Set(['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'menuitem', 'tab', 'switch', 'searchbox']);
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function runAxe(send, label) {
  await evaluate(send, AXE);
  const result = JSON.parse(await evaluate(send, `
    axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(AXE_TAGS)} } })
      .then(r => JSON.stringify({
        violations: r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.slice(0, 3).map(n => n.target.join(' ')) })),
        passes: r.passes.length,
      }))
  `));
  for (const v of result.violations) fail(`AXE${label}  ${v.id} (${v.impact}) — ${v.help} — ${v.targets.join(' | ')}`);
  if (result.violations.length === 0) note(`axe-core${label}: 0 violations, ${result.passes} rules passed`);
}

async function checkTree(send, opts = {}) {
  const { nodes } = await send('Accessibility.getFullAXTree');
  const live = (n) => n.ignored !== true;
  const interactive = nodes.filter((n) => INTERACTIVE.has(n.role?.value) && live(n));
  const counts = new Map();
  for (const n of interactive) {
    const name = (n.name?.value ?? '').trim();
    if (!name) fail(`AX-NAME  a ${n.role.value} has no accessible name`);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const dupes = [...counts].filter(([name, c]) => name && c > 1);
  for (const [name, c] of dupes) fail(`AX-AMBIGUOUS  ${c} controls share the accessible name ${JSON.stringify(name)}`);
  if (!dupes.length) note(`${interactive.length} interactive nodes, all named, none ambiguous`);

  // Headings inside the edited document are the ARTIFACT, not app chrome: a
  // real editor must tolerate documents with broken heading structure — the
  // engine's heading-skip rule exists to flag exactly that. When opts names
  // the document textbox, its subtree is excluded from the heading checks.
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  let headingNodes = nodes.filter((n) => n.role?.value === 'heading' && live(n));
  if (opts.contentTextbox) {
    const box = nodes.find((n) => n.role?.value === 'textbox' && (n.name?.value ?? '').trim() === opts.contentTextbox && live(n));
    if (box) {
      const inside = new Set([box.nodeId]);
      const stack = [...(box.childIds ?? [])];
      while (stack.length) {
        const id = stack.pop();
        if (inside.has(id)) continue;
        inside.add(id);
        stack.push(...(byId.get(id)?.childIds ?? []));
      }
      headingNodes = headingNodes.filter((n) => !inside.has(n.nodeId));
    }
  }
  const headings = headingNodes.map((n) => ({
    name: (n.name?.value ?? '').trim(),
    level: Number(n.properties?.find((p) => p.name === 'level')?.value?.value ?? 0),
  }));
  if (!headings.some((h) => h.level === 1)) fail('AX-HEADINGS  no h1');
  let prev = 0;
  for (const h of headings) {
    if (prev && h.level > prev + 1) fail(`AX-HEADINGS  level jumps h${prev} -> h${h.level} at ${JSON.stringify(h.name)}`);
    prev = h.level;
  }
  note(`headings: ${headings.map((h) => 'h' + h.level).join(' ')}`);

  if (!nodes.some((n) => n.role?.value === 'main' && live(n))) fail('AX-LANDMARK  no main landmark');
  if (!nodes.some((n) => n.properties?.some((p) => p.name === 'live' && p.value?.value))) fail('AX-LIVE  no live region');
}

/** Tab through the page: every stop must move focus and show a visible indicator. */
async function checkTabOrder(send, max = 80) {
  await evaluate(send, `document.activeElement?.blur(); window.scrollTo(0, 0)`);
  const seen = [];
  let invisible = 0;
  for (let i = 0; i < max; i++) {
    await key(send, 'Tab');
    const stop = await evaluate(send, `(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return null;
      // The indicator may be drawn by the element or by a wrapping control
      // that styles :focus-within (search field, editor page). Compare each
      // with focus and without it: a card's permanent shadow is not a focus
      // indicator. Refocusing after keyboard use keeps :focus-visible.
      const chain = [];
      for (let el = a, d = 0; el && d < 4; d++, el = el.parentElement) chain.push(el);
      const look = () => chain.map((el) => {
        const cs = getComputedStyle(el);
        return { outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, shadow: cs.boxShadow };
      });
      const focused = look();
      a.blur();
      const blurred = look();
      a.focus();
      const visible = focused.some((f, i) => (f.outline && !blurred[i].outline) || f.shadow !== blurred[i].shadow);
      // 120 chars, not 40: two engine findings on the same passage (e.g. a
      // long sentence that also reads dense) legitimately share their excerpt
      // prefix and differ only in the hint suffix.
      return { id: a.tagName + ':' + (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 120), visible };
    })()`);
    if (!stop) break;
    if (seen.at(-1) === stop.id) { fail(`KEYBOARD  Tab did not move focus from ${stop.id} — possible trap`); break; }
    if (seen.includes(stop.id)) break; // wrapped around
    seen.push(stop.id);
    if (!stop.visible) { invisible++; fail(`FOCUS  no visible focus indicator on ${stop.id}`); }
  }
  if (!invisible) note(`${seen.length} tab stops, each with a visible focus indicator`);
  return seen;
}

async function checkReflow(send) {
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const overflow = await evaluate(send, `document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  if (overflow > 1) fail(`REFLOW  ${overflow}px of horizontal scroll at 320 CSS px (SC 1.4.10)`);
  else note('reflows at 320 CSS px with no horizontal scroll');
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(200);
}

async function checkForcedColors(send) {
  // Both schemes: dark + forced colours is where theme blocks can outrank the
  // forced-colors block, and a light-scheme CI runner would never see it.
  for (const scheme of ['light', 'dark']) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }, { name: 'prefers-color-scheme', value: scheme }] });
    await sleep(200);
    if (!(await evaluate(send, `matchMedia('(forced-colors: active)').matches`))) fail('FORCED-COLORS  emulation did not take effect');
    await runAxe(send, `(forced-colors, ${scheme})`);
  }
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await sleep(150);
}

const liveText = (send) => evaluate(send, `(document.querySelector('[role=status]')||{}).textContent || ''`);
const focusByName = (send, selector, name) => evaluate(send, `(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => (e.getAttribute('aria-label') || e.textContent || '').trim().startsWith(${JSON.stringify(name)}));
  if (el) el.focus();
  return !!el && document.activeElement === el;
})()`);

async function openPage(path) {
  const { proc, target } = await launch(origin + path);
  const { ws, send } = await connect(target);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Accessibility.enable');
  // Pin the light scheme so results do not depend on the host's appearance.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await sleep(1200); // hydration
  return { proc, ws, send };
}

/* ---------- dashboard ---------- */

async function dashboard() {
  page = '/';
  const { proc, ws, send } = await openPage('/');
  try {
    // Every run starts from the seed. Chrome runs on its default profile, which
    // keeps localStorage per origin, so a reused port would otherwise inherit a
    // past run's edits and fail below with confusing counts.
    await evaluate(send, `localStorage.clear()`);
    await send('Page.reload');
    await sleep(1200);

    await runAxe(send, '');
    await checkTree(send);
    await checkTabOrder(send);

    // Search narrows the queue and announces the result once typing pauses.
    if (!(await focusByName(send, 'input', 'Search documents'))) fail('SEARCH  search field not found');
    await send('Input.insertText', { text: 'zzzz' });
    await sleep(900);
    const rows = await evaluate(send, `document.querySelectorAll('.dash-rows > li').length`);
    if (rows !== 0) fail(`SEARCH  "zzzz" left ${rows} rows`);
    const said = await liveText(send);
    if (!/0 documents match/.test(said)) fail(`AX-LIVE  search result not announced (got ${JSON.stringify(said)})`);
    else note(`search announced: ${JSON.stringify(said)}`);
    if (!(await focusByName(send, 'button', 'Clear search and filters'))) fail('EMPTY  empty state has no recovery action');
    await key(send, 'Enter');
    await sleep(300);
    const restored = await evaluate(send, `document.querySelectorAll('.dash-rows > li').length`);
    // 8 = every seed document (app/_data/seed.ts).
    if (restored !== 8) fail(`EMPTY  clearing did not restore the queue (${restored} rows)`);
    else note('empty state recovers with one action');

    // Severity filter is a real toggle and says what it did.
    await focusByName(send, '.dash-sevrow', 'Needs your call');
    await key(send, 'Enter');
    await sleep(300);
    // 5 = the seed documents with at least one manual finding: hearing-notice,
    // health-advisory, zoning-variance, benefits-guide (its form blanks) and
    // shelter-faq (its unmarked Spanish).
    const filtered = await evaluate(send, `document.querySelectorAll('.dash-rows > li').length`);
    const pressed = await evaluate(send, `document.activeElement.getAttribute('aria-pressed')`);
    if (filtered !== 5 || pressed !== 'true') fail(`FILTER  manual filter showed ${filtered} rows, aria-pressed=${pressed}`);
    else note('severity filter toggles, sets aria-pressed and narrows the queue');

    // Side cards are engine-derived now: the manual card must show a real
    // finding title from the seeds (not a scripted question), and the criteria
    // card must hold 1–5 derived rows.
    const manualCard = await evaluate(send, `document.querySelector('.dash-manual')?.textContent ?? ''`);
    const criteriaRows = await evaluate(send, `document.querySelectorAll('.dash-criteria li').length`);
    if (!manualCard.includes('Alternative text may not describe the image')) fail('SIDECARDS  the manual card does not show an engine-derived finding title');
    else if (criteriaRows < 1 || criteriaRows > 5) fail(`SIDECARDS  criteria card has ${criteriaRows} rows, expected 1-5 derived rows`);
    else note('side cards show engine-derived findings and criteria');

    await send('Page.reload');
    await sleep(1200);
    await checkReflow(send);
    await checkForcedColors(send);
  } finally {
    await shutdown(send, ws, proc);
  }
}

/* ---------- upload a .docx ---------- */

// The file never leaves the browser, so this drives the real path: a file set
// on the hidden input, the importer running in Chromium (its DOMParser and
// DecompressionStream, not linkedom's), the store, and navigation.
async function upload() {
  page = '/ (upload)';
  const { proc, ws, send } = await openPage('/');
  const choose = async (file) => {
    const { result } = await send('Runtime.evaluate', { expression: `document.querySelector('input[type=file]')` });
    if (!result.objectId) { fail('UPLOAD  no file input behind the Upload button'); return false; }
    await send('DOM.setFileInputFiles', { objectId: result.objectId, files: [resolve(ROOT, file)] });
    return true;
  };
  try {
    await evaluate(send, `localStorage.clear()`);
    await send('Page.reload');
    await sleep(1200);
    if (!(await focusByName(send, 'button', 'Upload .docx'))) fail('UPLOAD  no Upload .docx button');

    // A file that is not a .docx: a visible, announced message, and nothing stored.
    if (!(await choose('corpus/docx/library-hours.source.html'))) return;
    await sleep(800);
    const alert = await evaluate(send, `document.querySelector('.dash-import-error[role=alert]')?.textContent ?? ''`);
    if (!alert.includes('isn’t a .docx')) fail(`UPLOAD  a non-.docx file gave no visible alert (got ${JSON.stringify(alert)})`);
    else note('a non-.docx upload shows a visible role=alert message');
    await runAxe(send, ' (import error shown)');

    // A real .docx (pandoc's): stored, opened, announced with what was left out.
    if (!(await choose('corpus/docx/library-hours.pandoc.docx'))) return;
    let path = '';
    for (let i = 0; i < 30 && !path.startsWith('/editor/'); i++) {
      await sleep(200);
      path = await evaluate(send, `location.pathname`);
    }
    if (path !== '/editor/library-hours-notice') { fail(`UPLOAD  expected to land on /editor/library-hours-notice, got ${path}`); return; }
    page = path;
    await sleep(1500);
    const said = await liveText(send);
    if (!/^Imported Library hours notice\. .*blocking.* 1 table flattened/.test(said)) fail(`UPLOAD  announcement must name the document, what was found and what was not imported (got ${JSON.stringify(said)})`);
    else note(`upload announced: ${JSON.stringify(said)}`);
    const view = await evaluate(send, `({
      h1: document.querySelector('h1')?.textContent,
      notes: [...document.querySelectorAll('[aria-labelledby=import-notes-heading] li')].map((li) => li.textContent),
      headings: [...document.querySelectorAll('.ProseMirror h1, .ProseMirror h2, .ProseMirror h4')].length,
      lists: document.querySelectorAll('.ProseMirror ul, .ProseMirror ol').length,
      figures: document.querySelectorAll('.ProseMirror figure').length,
    })`);
    if (view.h1 !== 'Library hours notice' || view.headings !== 4 || view.lists !== 3 || view.figures !== 2) fail(`UPLOAD  the imported document lost structure: ${JSON.stringify(view)}`);
    else note('the imported document keeps its headings, nested lists and images in the editor');
    if (view.notes.length !== 1 || !view.notes[0].includes('table')) fail(`UPLOAD  import notes are not visible on the page (${JSON.stringify(view.notes)})`);
    else note('what was not carried over is visible, not only announced');
    await runAxe(send, ' (imported document)');
    // The imported h2 -> h4 jump is the file's own finding, flagged by the engine.
    await checkTree(send, { contentTextbox: 'Document text' });

    // Dismissing the notes keeps focus in the findings panel and survives a reload.
    if (!(await focusByName(send, 'button', 'Dismiss import notes'))) { fail('UPLOAD  no way to dismiss the import notes'); return; }
    await key(send, 'Enter');
    await sleep(300);
    const focus = await evaluate(send, `document.activeElement?.id ?? ''`);
    if (focus !== 'ada-issues-heading') fail(`UPLOAD  dismissing the notes dropped focus to ${JSON.stringify(focus)}`);
    await send('Page.reload');
    await sleep(1500);
    const after = await evaluate(send, `document.querySelectorAll('[aria-labelledby=import-notes-heading]').length`);
    if (after !== 0) fail('UPLOAD  dismissed import notes came back after a reload');
    else note('dismissing the notes keeps focus in the findings panel and persists');
  } finally {
    await shutdown(send, ws, proc);
  }
}

/* ---------- editor: initial triage ---------- */

// The initially-active finding card must be the MOST SEVERE finding, not the
// first in document order. benefits-guide is the doc where the two orders
// differ (an advisory figure precedes a violation link), so it pins the
// behavior; hearing-notice cannot (its blocker is first either way).
async function triage() {
  page = '/editor/benefits-guide';
  const { proc, ws, send } = await openPage(page);
  try {
    const severity = await evaluate(send, `document.querySelector('aside [role="group"][aria-labelledby^="finding-"] [data-severity]')?.getAttribute('data-severity') ?? 'none'`);
    if (severity !== 'violation') fail(`TRIAGE  initially-active card is "${severity}", expected the most severe finding (violation)`);
    else note('the initially-active card is the most severe finding, not the first in document order');

    // Contrast: the seed's Gray-on-Blue-highlight run (3.96:1). Its fix removes
    // the colour marks, the one Apply branch that is neither text nor attributes.
    const coloured = `[...document.querySelectorAll('#document-text mark, #document-text span[style*="color"]')].filter((el) => el.textContent.includes('light grey')).length`;
    const findings = () => evaluate(send, `Number(document.getElementById('ada-issues-heading').textContent.match(/\\d+/)[0])`);
    const beforeCount = await findings();
    const beforeMarks = await evaluate(send, coloured);
    const opened = await evaluate(send, `(() => {
      const card = [...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('Use default colours'));
      card?.click();
      return Boolean(card);
    })()`);
    if (!opened || beforeMarks === 0) { fail(`CONTRAST  no contrast finding on the coloured seed text (card=${opened}, coloured=${beforeMarks})`); return; }
    await sleep(200);
    if (!(await focusByName(send, 'aside button', 'Apply fix'))) { fail('CONTRAST  no Apply fix on the contrast finding'); return; }
    await key(send, 'Enter');
    await sleep(400);
    const afterMarks = await evaluate(send, coloured);
    const afterCount = await findings();
    const said = await liveText(send);
    if (afterMarks !== 0) fail(`CONTRAST  Apply fix left ${afterMarks} coloured element(s) on the text`);
    else if (afterCount !== beforeCount - 1) fail(`CONTRAST  findings ${beforeCount} -> ${afterCount} after applying the contrast fix`);
    else if (!/^Fix applied: Text contrast is below 4\.5:1\. \d+ open\./.test(said)) fail(`CONTRAST  fix not announced with what remains (got ${JSON.stringify(said)})`);
    else note('the contrast fix removes the failing colours, clears the finding and says what remains');
  } finally {
    await shutdown(send, ws, proc);
  }
}

/* ---------- editor: language of parts ---------- */

// shelter-faq's "Spanish-language help: Llame al 311 para ayuda." Apply marks
// only the Spanish; the toolbar's Language menu marks a selection.
async function language() {
  page = '/editor/shelter-faq';
  const { proc, ws, send } = await openPage(page);
  try {
    const findings = () => evaluate(send, `Number(document.getElementById('ada-issues-heading').textContent.match(/\\d+/)[0])`);
    const marked = (lang) => evaluate(send, `[...document.querySelectorAll('#document-text span[lang=${JSON.stringify(lang)}]')].map((el) => el.textContent).join('|')`);
    const beforeCount = await findings();
    const opened = await evaluate(send, `(() => {
      const card = [...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('Mark the language'));
      card?.click();
      return Boolean(card);
    })()`);
    if (!opened) { fail('LANG  no language-of-parts finding on the unmarked Spanish'); return; }
    await sleep(200);
    const suggestion = await evaluate(send, `document.querySelector('aside [role="group"][aria-labelledby^="finding-"]')?.textContent ?? ''`);
    if (!suggestion.includes('Suggested change: mark it as Spanish')) fail(`LANG  the card does not say what Apply does (${JSON.stringify(suggestion.slice(0, 200))})`);
    if (!(await focusByName(send, 'aside button', 'Apply fix'))) { fail('LANG  no Apply fix on the language finding'); return; }
    await key(send, 'Enter');
    await sleep(400);
    const spanish = await marked('es');
    const afterCount = await findings();
    const said = await liveText(send);
    if (spanish !== 'Llame al 311 para ayuda') fail(`LANG  Apply marked ${JSON.stringify(spanish)}, expected only the Spanish clause`);
    else if (afterCount !== beforeCount - 1) fail(`LANG  findings ${beforeCount} -> ${afterCount} after marking the language`);
    else if (!/^Fix applied: Text may be in Spanish but isn’t marked\. \d+ open\./.test(said)) fail(`LANG  fix not announced with what remains (got ${JSON.stringify(said)})`);
    else note('Apply marks only the Spanish clause, clears the finding and says what remains');

    // Toolbar: select "shelter" in the editor, choose French from the Language menu.
    await evaluate(send, `(() => {
      const walker = document.createTreeWalker(document.getElementById('document-text'), NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = n.data.indexOf('shelter opens');
        if (i >= 0) { document.getElementById('document-text').focus(); getSelection().setBaseAndExtent(n, i, n, i + 7); return; }
      }
    })()`);
    await sleep(300);
    const chosen = await evaluate(send, `(() => {
      const select = document.querySelector('select[aria-label="Language"]');
      if (!select || select.getAttribute('data-tb') === null) return false;
      select.value = 'fr';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await sleep(300);
    const french = await marked('fr');
    const announced = await liveText(send);
    if (!chosen) fail('LANG  the toolbar has no Language menu');
    else if (french !== 'shelter') fail(`LANG  the Language menu marked ${JSON.stringify(french)}, expected "shelter"`);
    else if (announced !== 'Marked as French.') fail(`LANG  choosing a language was not announced (got ${JSON.stringify(announced)})`);
    else note('the toolbar Language menu marks the selection and says so');
    // Nothing selected: refused like a link, said so, and the menu snaps back.
    await evaluate(send, `getSelection().collapseToEnd()`);
    await sleep(300);
    const refused = await evaluate(send, `(() => {
      const select = document.querySelector('select[aria-label="Language"]');
      select.value = 'de';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    })()`);
    await sleep(300);
    const refusal = await liveText(send);
    if (refusal !== 'Select the text you want to mark first.') fail(`LANG  a language with nothing selected was not refused (got ${JSON.stringify(refusal)})`);
    else if (refused !== '' || (await marked('de')) !== '') fail(`LANG  a refused language still shows or applied (menu=${JSON.stringify(refused)})`);
    else note('with nothing selected, the Language menu says to select text first and changes nothing');

    // Document language: set the (English) FAQ to Spanish and it asks once
    // whether that's right; Apply sets it back and says what remains.
    const rootLang = () => evaluate(send, `document.getElementById('document-text').getAttribute('lang')`);
    const setDoc = await evaluate(send, `(() => {
      const select = document.querySelector('select[aria-label="Document language"]');
      if (!select) return false;
      select.value = 'es';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await sleep(400);
    const spanishRoot = await rootLang();
    const setSaid = await liveText(send);
    const asked = await evaluate(send, `(() => {
      const card = [...document.querySelectorAll('aside button')].find((b) => b.textContent.includes('Set the document language'));
      card?.click();
      return Boolean(card);
    })()`);
    await sleep(200);
    if (!setDoc) fail('DOCLANG  the editor has no Document language menu');
    else if (spanishRoot !== 'es') fail(`DOCLANG  the editor text is lang=${JSON.stringify(spanishRoot)} after choosing Spanish`);
    else if (!/^Document language set to Spanish\. \d+ open\./.test(setSaid)) fail(`DOCLANG  the change was not announced (got ${JSON.stringify(setSaid)})`);
    else if (!asked) fail('DOCLANG  a mostly English document set to Spanish did not ask about its language');
    else if (!(await evaluate(send, `document.querySelector('aside').textContent.includes('Suggested change: set the document language to English')`))) {
      fail('DOCLANG  the card does not say what Apply does');
    } else {
      await focusByName(send, 'aside button', 'Apply fix');
      await key(send, 'Enter');
      await sleep(400);
      const back = await rootLang();
      const backSaid = await liveText(send);
      const still = await evaluate(send, `[...document.querySelectorAll('aside button')].some((b) => b.textContent.includes('Set the document language'))`);
      if (back !== 'en' || still) fail(`DOCLANG  Apply left lang=${JSON.stringify(back)}, question still listed: ${still}`);
      else if (!/^Document language set to English\. \d+ open\./.test(backSaid)) fail(`DOCLANG  Apply was not announced (got ${JSON.stringify(backSaid)})`);
      else note('choosing a document language relabels the editor, asks when the text disagrees, and Apply sets it back');
      // Undo is a language change too: the question about Spanish comes back
      // at once, not at the next blur.
      await evaluate(send, `(() => {
        const editor = document.getElementById('document-text');
        editor.focus();
        const mac = /Mac/.test(navigator.platform);
        editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', metaKey: mac, ctrlKey: !mac, bubbles: true, cancelable: true }));
      })()`);
      await sleep(400);
      const undone = await rootLang();
      // Listed or active: the active finding is a card, not a list button.
      const reasked = await evaluate(send, `document.querySelector('aside').textContent.includes('Document language is Spanish, but most of it reads as English')`);
      if (undone !== 'es' || !reasked) fail(`DOCLANG  undo left lang=${JSON.stringify(undone)}, question listed: ${reasked}`);
      else note('undoing a language change rechecks at once');
    }
    await runAxe(send, ' (language)');
  } finally {
    await shutdown(send, ws, proc);
  }
}

/* ---------- editor ---------- */

async function editor() {
  page = '/editor/hearing-notice';
  const { proc, ws, send } = await openPage(page);
  try {
    await runAxe(send, '');
    await checkTree(send, { contentTextbox: 'Document text' });
    const stops = await checkTabOrder(send);
    const toolbarStops = stops.filter((s) => /^(BUTTON|SELECT):(Font family|Bold|Italic|Heading 1)/.test(s)).length;
    if (toolbarStops > 1) fail(`TOOLBAR  ${toolbarStops} toolbar controls in the tab order; a toolbar is one tab stop`);
    else note('toolbar is a single tab stop');

    // Arrow keys move within the toolbar.
    await evaluate(send, `document.querySelector('[role=toolbar] [data-tb]').focus()`);
    await key(send, 'ArrowRight');
    const second = await evaluate(send, `document.activeElement.getAttribute('aria-label')`);
    if (second !== 'Font size') fail(`TOOLBAR  ArrowRight moved to ${JSON.stringify(second)}, expected "Font size"`);
    else note('ArrowRight moves within the toolbar');

    // Findings come from the real engine over the seed content, not fixtures.
    // Every severity with underlinable TEXT findings shows its distinct shape:
    // violation wavy, advisory dotted, manual dashed. The seed's blocker (an
    // image without alt text) anchors to a figure node — figures get a NodeView
    // badge, not a text underline — so it is asserted via its card.
    const shapes = await evaluate(send, `[...document.querySelectorAll('.ada-underline')].map(e => getComputedStyle(e).textDecorationStyle)`);
    const distinct = [...new Set(shapes)].sort();
    if (JSON.stringify(distinct) !== JSON.stringify(['dashed', 'dotted', 'wavy'])) fail(`UNDERLINES  expected wavy/dotted/dashed, got ${JSON.stringify(shapes)}`);
    else note(`underline shapes: ${distinct.join(', ')}`);
    const blockerCard = await evaluate(send, `!!document.querySelector('aside [data-severity="blocker"]')`);
    if (!blockerCard) fail('UNDERLINES  the seed blocker (image without alt text) has no card in the findings region');
    else note('blocker finding present as a card (figure-anchored, no text underline)');

    const findingCount = () => evaluate(send, `Number(document.getElementById('ada-issues-heading').textContent.match(/\\d+/)[0])`);

    // Structural rules run live on every keystroke (§8.1): editing the flagged
    // link label removes its finding without waiting for blur or Recheck. The
    // caret is placed inside the "click here" link and typed into, which makes
    // the label non-generic.
    const placed = await evaluate(send, `(() => {
      const a = [...document.querySelectorAll('#document-text a[href]')].find(x => x.textContent.includes('click here'));
      if (!a) return false;
      // The link text may sit inside the underline decoration span, so walk
      // down to the first real text node rather than trusting firstChild.
      const textNode = document.createTreeWalker(a, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange();
      range.setStart(textNode, 2);
      range.collapse(true);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.getElementById('document-text').focus();
      return true;
    })()`);
    if (!placed) fail('LIVE  the seed\'s "click here" link is missing');
    const beforeTyping = await findingCount();
    await send('Input.insertText', { text: ' now' });
    await sleep(400);
    const afterTyping = await findingCount();
    if (afterTyping !== beforeTyping - 1) fail(`LIVE  editing the generic link label changed findings ${beforeTyping} -> ${afterTyping}, expected -1 without blur or Recheck`);
    else note('structural findings update live while typing');

    // No compliance score anywhere (patterns-suggestion.md, Layer 3).
    const scored = await evaluate(send, `/\\/\\s*100|compliance score|% compliant/i.test(document.body.innerText)`);
    if (scored) fail('SUMMARY  page renders a compliance score');
    else note('no compliance score; summary is counts only');

    // Apply a fix: the engine's mechanical fixes are attribute changes, so
    // this exercises the anchor-aware Apply path — the seed's h1→h3 skip
    // becomes an h2, the finding goes, focus lands on a card.
    const before = await evaluate(send, `document.querySelectorAll('.ada-underline').length`);
    const opened = await evaluate(send, `(() => {
      const card = [...document.querySelectorAll('aside button')].find(b => b.textContent.includes('Fix the heading level'));
      card?.click();
      return Boolean(card);
    })()`);
    if (!opened) fail('FINDINGS  no heading-skip card to open');
    await sleep(200);
    if (!(await focusByName(send, 'aside button', 'Apply fix'))) fail('FINDINGS  no Apply fix on the heading-skip finding');
    await key(send, 'Enter');
    await sleep(400);
    const headingFixed = await evaluate(send, `(() => {
      const d = document.getElementById('document-text');
      if (!d) return null;
      return { h3: d.querySelectorAll('h3').length, h2: [...d.querySelectorAll('h2')].filter(h => h.textContent === 'Public Comment').length };
    })()`);
    if (headingFixed === null) fail('FINDINGS  the editor did not render when checking the applied fix (no #document-text)');
    else if (headingFixed.h3 !== 0 || headingFixed.h2 !== 1) fail(`FINDINGS  Apply fix did not change the heading level (h3=${headingFixed.h3}, h2=${headingFixed.h2})`);
    const after = await evaluate(send, `document.querySelectorAll('.ada-underline').length`);
    if (after !== before - 1) fail(`FINDINGS  underline count ${before} -> ${after} after applying a fix`);
    const focusAfter = await evaluate(send, `document.activeElement === document.body ? 'BODY' : document.activeElement.tagName`);
    if (focusAfter === 'BODY') fail('KEYBOARD  focus fell to <body> after applying a fix');
    const said = await liveText(send);
    if (!/Fix applied/.test(said)) fail(`AX-LIVE  apply not announced (got ${JSON.stringify(said)})`);
    else note(`apply fix announced: ${JSON.stringify(said.slice(0, 70))}`);

    // Dismiss keeps focus in the findings region.
    await focusByName(send, 'aside button', 'Dismiss');
    await key(send, 'Enter');
    await sleep(400);
    const inAside = await evaluate(send, `!!document.activeElement.closest('aside')`);
    if (!inAside) fail('KEYBOARD  focus left the findings region after Dismiss');
    else note('focus stays in the findings region after Dismiss');
    // Baseline for the reload check below: only the two pasted images may
    // change this count — in particular, the dismissal must survive.
    const countAfterDismiss = await findingCount();

    // Header & footer dialog: opens, traps, closes on Escape, returns focus.
    await focusByName(send, '[role=toolbar] button', 'Edit header and footer');
    await key(send, 'Enter');
    await sleep(300);
    const dialog = await evaluate(send, `!!document.querySelector('[role=dialog]') && !!document.activeElement.closest('[role=dialog]')`);
    if (!dialog) fail('DIALOG  header & footer dialog did not open with focus inside');
    await key(send, 'Escape');
    await sleep(300);
    const back = await evaluate(send, `document.activeElement.getAttribute('aria-label')`);
    if (back !== 'Edit header and footer') fail(`DIALOG  focus returned to ${JSON.stringify(back)}, not the trigger`);
    else note('dialog opens with focus inside, Escape closes, focus returns to trigger');

    // F6 cycles regions.
    await evaluate(send, `document.querySelector('main').focus()`);
    await key(send, 'F6');
    const moved = await evaluate(send, `!!document.activeElement.closest('aside')`);
    if (!moved) fail('KEYBOARD  F6 did not move from the document to the findings region');
    else note('F6 cycles between document and findings');

    // Paste goes through the same parser as the clipboard: an unsafe link must
    // lose its href (text kept), and a pasted image without alt must be flagged
    // like an inserted one. The same clipboard payload — with the same
    // data-figure-id — is pasted twice: transformPasted always assigns a fresh
    // id regardless of what was pasted. If that renumbering ever regressed to
    // keep the pasted id, the copies would collide with each other and with the
    // seed's own "img-1", and the uniqueness check below would catch it.
    const figureIds = () => evaluate(send, `[...document.querySelectorAll('#document-text [data-figure-id]')].map((el) => el.dataset.figureId)`);
    const pasteOnce = () => evaluate(send, `(() => {
      const el = document.getElementById('document-text');
      el.focus();
      const dt = new DataTransfer();
      dt.setData('text/html', '<p><a href="javascript:alert(1)">pasted link</a></p><figure data-figure-id="img-1"></figure>');
      dt.setData('text/plain', 'pasted link');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    })()`);
    const findingsBefore = await findingCount();
    const idsBefore = await figureIds();
    await pasteOnce();
    await sleep(300);
    await pasteOnce();
    await sleep(300);
    const pasted = await evaluate(send, `(() => {
      const doc = document.getElementById('document-text');
      if (!doc) return null;
      return { unsafe: doc.querySelectorAll('a[href^="javascript" i]').length, text: doc.textContent.includes('pasted link') };
    })()`);
    if (pasted === null) fail('PASTE  the editor did not render when checking the paste (no #document-text)');
    const findingsAfter = await findingCount();
    const idsAfter = await figureIds();
    if (pasted && (pasted.unsafe || !pasted.text)) fail(`PASTE  unsafe link kept its href (${pasted.unsafe}) or its text was lost (${pasted.text})`);
    else note('pasted javascript: link keeps its text and loses its href');
    if (findingsAfter !== findingsBefore + 2) fail(`PASTE  two pasted images without alt text changed findings ${findingsBefore} -> ${findingsAfter}, expected +2`);
    else note('pasted images without alt text are flagged as findings');
    if (idsAfter.length !== idsBefore.length + 2) fail(`PASTE  expected exactly two new figures, got ${idsBefore.length} -> ${idsAfter.length}`);
    else if (new Set(idsAfter).size !== idsAfter.length) fail(`PASTE  two pastes of the same clipboard payload produced colliding figure ids: ${JSON.stringify(idsAfter)}`);
    else note('repeated paste of the same payload gets fresh, non-colliding ids each time');

    // A pending debounced save must survive SPA navigation: Next Link navs
    // fire no pagehide, so leaving within the 500ms debounce window used to
    // strand the last edit. Type, navigate away immediately, come back.
    await evaluate(send, `(() => {
      const p = document.querySelector('#document-text p');
      const range = document.createRange();
      range.selectNodeContents(p);
      range.collapse(false);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.getElementById('document-text').focus();
    })()`);
    await send('Input.insertText', { text: ' persisted-marker' });
    await evaluate(send, `document.querySelector('a[aria-label="Back to all documents"]').click()`);
    await sleep(800);
    const onDashboard = await evaluate(send, `location.pathname`);
    if (onDashboard !== '/') fail(`PERSIST  back navigation did not reach the dashboard (at ${JSON.stringify(onDashboard)})`);
    await evaluate(send, `history.back()`);
    await sleep(1500);
    const markerPersisted = await evaluate(send, `document.getElementById('document-text')?.textContent.includes('persisted-marker') ?? false`);
    if (!markerPersisted) fail('PERSIST  SPA navigation within the debounce window lost the pending save');
    else note('leaving via SPA navigation flushes the pending save');

    await send('Page.reload');
    await sleep(1200);

    // The store persists to localStorage on a 500ms debounce: after reload the
    // edits must still be there, loaded from the store rather than the seed —
    // the applied heading fix, the pasted content, and all four figures.
    const persisted = await evaluate(send, `(() => {
      const d = document.getElementById('document-text');
      if (!d) return null;
      return {
        fixed: [...d.querySelectorAll('h2')].filter(h => h.textContent === 'Public Comment').length,
        h3: d.querySelectorAll('h3').length,
        pasted: d.textContent.includes('pasted link'),
        figures: d.querySelectorAll('[data-figure-id]').length,
      };
    })()`);
    if (persisted === null) fail('PERSIST  the editor did not render after reload (no #document-text) — a crashed gate hides every other finding');
    else if (persisted.fixed !== 1 || persisted.h3 !== 0) fail(`PERSIST  reload lost the applied heading fix (${JSON.stringify(persisted)})`);
    else if (!persisted.pasted) fail('PERSIST  reload lost the pasted content (debounced localStorage save)');
    else if (persisted.figures !== 4) fail(`PERSIST  expected 2 seed + 2 pasted figures after reload, got ${persisted.figures}`);
    else note('reload restores the edited document from localStorage');
    const findingsAfterReload = await findingCount();
    if (findingsAfterReload !== countAfterDismiss + 2) fail(`PERSIST  findings went ${countAfterDismiss} -> ${findingsAfterReload} across reload; expected exactly +2 (the pasted images), i.e. the dismissal persisted`);
    else note('dismissals persist across reloads (count = post-dismiss + 2 pasted images)');

    await checkReflow(send);
    await checkForcedColors(send);
    await checkExport(send);
  } finally {
    await shutdown(send, ws, proc);
  }
}

// Export: the downloaded page must be exactly as accessible as the findings
// say, and a hostile title from localStorage (a trust boundary) must stay
// text. Last step of editor(): it navigates away from the editor.
async function checkExport(send) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  const hostile = 'Notice </title><script>window.__pwned = 1</script>';
  await evaluate(send, `(() => {
    const docs = JSON.parse(localStorage.getItem('ada.docs.v1'));
    docs.find((d) => d.id === 'hearing-notice').title = ${JSON.stringify(hostile)};
    localStorage.setItem('ada.docs.v1', JSON.stringify(docs));
  })()`);
  await send('Page.reload');
  await sleep(1200);

  const dir = mkdtempSync(join(tmpdir(), 'ada-export-'));
  try {
    // Page-scoped: this socket is a page target, where the Browser-domain call is ignored.
    await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
    const missingAlt = await evaluate(send, `[...document.querySelectorAll('#document-text figcaption')].filter((c) => c.textContent.includes('Missing alt text')).length`);
    if (!(await focusByName(send, 'button', 'Export HTML'))) { fail('EXPORT  no Export HTML button'); return; }
    await key(send, 'Enter');
    let file;
    for (let i = 0; i < 25 && !file; i++) {
      await sleep(200);
      file = readdirSync(dir).find((f) => f.endsWith('.html'));
    }
    if (!file) { fail(`EXPORT  no .html file was downloaded (dir: ${JSON.stringify(readdirSync(dir))}, said: ${JSON.stringify(await liveText(send))})`); return; }
    const said = await liveText(send);
    if (!/^Exported hearing-notice\.html\. .*review/.test(said)) fail(`EXPORT  announcement must name the file and what remains (got ${JSON.stringify(said)})`);
    else note(`export announced: ${JSON.stringify(said)}`);

    await send('Page.navigate', { url: pathToFileURL(join(dir, file)).href });
    await sleep(800);
    const page = await evaluate(send, `({ title: document.title, pwned: window.__pwned === 1, scripts: document.scripts.length, lang: document.documentElement.lang })`);
    if (page.title !== hostile || page.pwned || page.scripts) fail(`EXPORT  a hostile stored title escaped into markup (${JSON.stringify(page)})`);
    else note('a hostile stored title stays text in the exported page');
    if (page.lang !== 'en') fail(`EXPORT  exported page has no language (lang=${JSON.stringify(page.lang)})`);

    await evaluate(send, AXE);
    const violations = JSON.parse(await evaluate(send, `
      axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(AXE_TAGS)} } })
        .then((r) => JSON.stringify(r.violations.map((v) => ({ id: v.id, nodes: v.nodes.length }))))
    `));
    for (const v of violations.filter((x) => x.id !== 'role-img-alt')) fail(`EXPORT  axe: ${v.id} x${v.nodes} in the exported page`);
    const unnamed = violations.find((v) => v.id === 'role-img-alt')?.nodes ?? 0;
    if (unnamed !== missingAlt) fail(`EXPORT  ${unnamed} unnamed images exported, but the editor showed ${missingAlt} missing alt text`);
    else note(`exported page: axe clean apart from the ${missingAlt} image(s) the editor flags as missing alt`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

try {
  await dashboard();
  await upload();
  await triage();
  await language();
  await editor();
} finally {
  server.kill();
}

console.log('Ada-editor app accessibility verification\n');
if (VERBOSE) console.log(notes.join('\n') + '\n');
if (failures.length) {
  console.error(`FAILED (${failures.length})\n`);
  for (const f of failures) console.error('  ' + f);
  console.error('\nFix the screens. Do not weaken the check.');
  process.exit(1);
}
console.log(`PASSED — ${notes.length} checks, 0 failures.`);
