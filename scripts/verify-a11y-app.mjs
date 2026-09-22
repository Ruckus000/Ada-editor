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
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CHROME, connect, evaluate, key, launch, shutdown, sleep, watchdog } from './cdp.mjs';

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
const server = spawn(NEXT, ['start', '-p', String(port), '-H', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });

// A hung browser must fail the gate, not stall it forever, and must not leave
// `next start` or Chrome running behind it. (`next build` above blocks timers,
// so the clock starts here.)
watchdog(8 * 60_000, () => server.kill('SIGKILL'));

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

async function checkTree(send) {
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

  const headings = nodes.filter((n) => n.role?.value === 'heading' && live(n)).map((n) => ({
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
      return { id: a.tagName + ':' + (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 40), visible };
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
    if (restored !== 8) fail(`EMPTY  clearing did not restore the queue (${restored} rows)`);
    else note('empty state recovers with one action');

    // Severity filter is a real toggle and says what it did.
    await focusByName(send, '.dash-sevrow', 'Needs your call');
    await key(send, 'Enter');
    await sleep(300);
    const filtered = await evaluate(send, `document.querySelectorAll('.dash-rows > li').length`);
    const pressed = await evaluate(send, `document.activeElement.getAttribute('aria-pressed')`);
    if (filtered !== 3 || pressed !== 'true') fail(`FILTER  manual filter showed ${filtered} rows, aria-pressed=${pressed}`);
    else note('severity filter toggles, sets aria-pressed and narrows the queue');

    await send('Page.reload');
    await sleep(1200);
    await checkReflow(send);
    await checkForcedColors(send);
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
    await checkTree(send);
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

    // Four findings, one per severity, each with a distinct underline shape.
    const shapes = await evaluate(send, `[...document.querySelectorAll('.ada-underline')].map(e => getComputedStyle(e).textDecorationStyle)`);
    if (new Set(shapes).size !== 4) fail(`UNDERLINES  expected 4 distinct shapes, got ${JSON.stringify(shapes)}`);
    else note(`underline shapes: ${shapes.join(', ')}`);

    // No compliance score anywhere (patterns-suggestion.md, Layer 3).
    const scored = await evaluate(send, `/\\/\\s*100|compliance score|% compliant/i.test(document.body.innerText)`);
    if (scored) fail('SUMMARY  page renders a compliance score');
    else note('no compliance score; summary is counts only');

    // Apply a fix: the text changes, the finding goes, focus lands on a card.
    const before = await evaluate(send, `document.querySelectorAll('.ada-underline').length`);
    await evaluate(send, `[...document.querySelectorAll('aside button')].find(b => b.textContent.includes('clicking here')).click()`);
    await sleep(200);
    if (!(await focusByName(send, 'aside button', 'Apply fix'))) fail('FINDINGS  no Apply fix on the link finding');
    await key(send, 'Enter');
    await sleep(400);
    const text = await evaluate(send, `document.getElementById('document-text').textContent`);
    if (!text.includes('is available as a linked PDF')) fail('FINDINGS  Apply fix did not change the document');
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
    // id regardless of what was pasted, so a single paste can't prove ids don't
    // collide (there's nothing yet to collide with). Two identical pastes are the
    // real test — if the renumbering ever regressed to keep the pasted id, both
    // copies would share "img-1" and this would catch it.
    const findingCount = () => evaluate(send, `Number(document.getElementById('ada-issues-heading').textContent.match(/\\d+/)[0])`);
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
      return { unsafe: doc.querySelectorAll('a[href^="javascript" i]').length, text: doc.textContent.includes('pasted link') };
    })()`);
    const findingsAfter = await findingCount();
    const idsAfter = await figureIds();
    if (pasted.unsafe || !pasted.text) fail(`PASTE  unsafe link kept its href (${pasted.unsafe}) or its text was lost (${pasted.text})`);
    else note('pasted javascript: link keeps its text and loses its href');
    if (findingsAfter !== findingsBefore + 2) fail(`PASTE  two pasted images without alt text changed findings ${findingsBefore} -> ${findingsAfter}, expected +2`);
    else note('pasted images without alt text are flagged as findings');
    if (idsAfter.length !== idsBefore.length + 2) fail(`PASTE  expected exactly two new figures, got ${idsBefore.length} -> ${idsAfter.length}`);
    else if (new Set(idsAfter).size !== idsAfter.length) fail(`PASTE  two pastes of the same clipboard payload produced colliding figure ids: ${JSON.stringify(idsAfter)}`);
    else note('repeated paste of the same payload gets fresh, non-colliding ids each time');

    await send('Page.reload');
    await sleep(1200);
    await checkReflow(send);
    await checkForcedColors(send);
  } finally {
    await shutdown(send, ws, proc);
  }
}

try {
  await dashboard();
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
