#!/usr/bin/env node
/**
 * Accessibility gate for the app screens (Homepage, Editor).
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
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { CHROME, connect, evaluate, key, launch, shutdown, sleep, track, watchdog } from './cdp.mjs';
import { P, R, docx } from './harness/docx.mjs';
import { png } from './harness/images.mjs';

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

/* ---------- homepage ---------- */

const visibleCount = (send, selector) => evaluate(send, `[...document.querySelectorAll(${JSON.stringify(selector)})].filter((el) => el.getClientRects().length > 0).length`);
/** Keep only these seed documents, then reload: drives the desk's layouts. */
const keepDocs = async (send, ids) => {
  await evaluate(send, `localStorage.setItem('ada.docs.v1', JSON.stringify(JSON.parse(localStorage.getItem('ada.docs.v1')).filter((d) => ${JSON.stringify(ids)}.includes(d.id))))`);
  await send('Page.reload');
  await sleep(1200);
};

async function home() {
  page = '/';
  const { proc, ws, send } = await openPage('/');
  try {
    // Every run starts from the seed. Chrome runs on its default profile, which
    // keeps localStorage per origin, so a reused port would otherwise inherit a
    // past run's edits and fail below with confusing counts.
    await evaluate(send, `localStorage.clear()`);
    await send('Page.reload');
    await sleep(1200);

    // 8 seed documents: the grid layout.
    // 8 = every seed document (app/_data/seed.ts).
    const cards = await evaluate(send, `document.querySelectorAll('.home-grid > li').length`);
    if (cards !== 8) fail(`GRID  expected the 8 seed documents as a grid, got ${cards}`);
    await runAxe(send, '');
    await checkTree(send);
    await checkTabOrder(send);

    // Questions are engine-derived: the notes show real manual finding titles.
    const calls = await evaluate(send, `document.querySelector('.home-calls')?.textContent ?? ''`);
    if (!calls.includes('Alternative text may not describe the image')) fail('CALLS  the notes do not show an engine-derived finding title');
    else note('"Your call" notes show engine-derived questions');

    // Search opens as a modal, narrows, announces the count once, and hands focus back.
    if (!(await focusByName(send, 'button', 'Find a document'))) fail('SEARCH  no Find a document button');
    await key(send, 'Enter');
    await sleep(400);
    const inCombo = await evaluate(send, `document.activeElement?.getAttribute('role') === 'combobox' && !!document.activeElement.closest('[role=dialog]')`);
    if (!inCombo) fail('SEARCH  focus did not move to the search field in a dialog');
    await send('Input.insertText', { text: 'notice' });
    await sleep(900);
    await runAxe(send, ' (search open)');
    const hits = await evaluate(send, `document.querySelectorAll('[role=listbox] [role=option]').length`);
    const activeOk = await evaluate(send, `(() => { const id = document.activeElement.getAttribute('aria-activedescendant'); return !!id && document.getElementById(id)?.getAttribute('aria-selected') === 'true'; })()`);
    if (hits < 1 || !activeOk) fail(`SEARCH  "notice" gave ${hits} options, active option wired: ${activeOk}`);
    await send('Input.insertText', { text: 'zzzz' });
    await sleep(900);
    const said = await liveText(send);
    if (!/0 documents match/.test(said)) fail(`AX-LIVE  search result not announced (got ${JSON.stringify(said)})`);
    else note(`search announced: ${JSON.stringify(said)}`);
    await key(send, 'Escape');
    await sleep(400);
    const back = await evaluate(send, `!document.querySelector('[role=dialog]') && (document.activeElement?.textContent ?? '').includes('Find a document')`);
    if (!back) fail('SEARCH  Escape did not close the dialog and return focus to its button');
    else note('search modal: combobox wired, count announced, Escape returns focus');

    // Status filter is a real toggle and says what it did.
    await focusByName(send, '.home-chip', 'Needs your call');
    await key(send, 'Enter');
    await sleep(300);
    // 5 = the seed documents with at least one manual finding: hearing-notice,
    // health-advisory, zoning-variance, benefits-guide (its form blanks) and
    // shelter-faq (its unmarked Spanish).
    const filtered = await evaluate(send, `document.querySelectorAll('.home-grid > li').length`);
    const pressed = await evaluate(send, `document.activeElement.getAttribute('aria-pressed')`);
    if (filtered !== 5 || pressed !== 'true') fail(`FILTER  manual filter showed ${filtered} sheets, aria-pressed=${pressed}`);
    else note('status filter toggles, sets aria-pressed and narrows the grid');

    // The account button reveals Privacy (and, with accounts, Sign out).
    await focusByName(send, 'button', 'Account');
    await key(send, 'Enter');
    await sleep(200);
    if (!(await focusByName(send, 'a', 'Privacy'))) fail('ACCOUNT  the account button does not reveal Privacy');
    // The gate builds without Supabase (local mode): no Sign out, and the menu says why.
    const accountNote = await evaluate(send, `document.querySelector('.home-pop__note')?.textContent ?? ''`);
    if (!accountNote.includes('No account')) fail(`ACCOUNT  local mode does not explain the missing Sign out (got ${JSON.stringify(accountNote)})`);
    await key(send, 'Escape');

    await send('Page.reload');
    await sleep(1200);
    await checkReflow(send);
    await checkForcedColors(send);

    // Phones: the questions become a pad showing one note at a time.
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(300);
    const oneNote = await visibleCount(send, '.home-calls .home-note');
    if (oneNote !== 1) fail(`PAD  expected one visible note at phone width, got ${oneNote}`);
    await focusByName(send, 'button', 'Next question');
    await key(send, 'Enter');
    await sleep(300);
    const flipped = await liveText(send);
    if (!/^Question 2 of 3/.test(flipped)) fail(`PAD  flipping the pad was not announced (got ${JSON.stringify(flipped)})`);
    else note('phone: one note at a time, flipping is announced');
    await send('Emulation.clearDeviceMetricsOverride');
    await sleep(200);

    // Deleting from a sheet: focus shows its veil, Delete is named for its
    // document, and focus lands on the sheet that takes its place. 8 → 7
    // documents, so the grid stays.
    page = '/ (delete a sheet)';
    await evaluate(send, `document.querySelector('.home-sheet[href="/editor/shelter-faq"]').focus()`);
    await sleep(400);
    const veil = await evaluate(send, `getComputedStyle(document.activeElement.closest('.home-card').querySelector('.home-card__veil')).opacity`);
    if (veil !== '1') fail(`CARD  focusing a sheet did not show its Open/Delete veil (opacity ${veil})`);
    await runAxe(send, ' (veil shown)');
    const next = await evaluate(send, `(() => { const all = [...document.querySelectorAll('.home-main .home-sheet')].map((a) => a.getAttribute('href')); const i = all.indexOf('/editor/shelter-faq'); return all[i + 1] ?? all[i - 1]; })()`);
    await evaluate(send, `window.confirm = () => true`);
    if (!(await focusByName(send, 'button', 'Delete Winter Shelter Program FAQ'))) fail('CARD  no Delete button named for its document');
    await key(send, 'Enter');
    await sleep(800);
    const afterCard = await evaluate(send, `({ stored: JSON.parse(localStorage.getItem('ada.docs.v1')).map((d) => d.id), sheets: document.querySelectorAll('.home-grid > li').length, focus: document.activeElement?.getAttribute('href') ?? document.activeElement?.tagName })`);
    const cardSaid = await liveText(send);
    if (afterCard.stored.includes('shelter-faq') || afterCard.sheets !== 7) fail(`CARD  Delete did not remove the document: ${JSON.stringify(afterCard)}`);
    else if (afterCard.focus !== next) fail(`CARD  focus fell to ${JSON.stringify(afterCard.focus)} instead of the next sheet, ${next}`);
    else if (!/^Deleted Winter Shelter Program FAQ\./.test(cardSaid)) fail(`CARD  deletion was not announced (got ${JSON.stringify(cardSaid)})`);
    else note('Delete on a sheet removes it, announces it and focuses the next sheet');

    // 2–4 documents: the loose desk.
    page = '/ (desk)';
    await keepDocs(send, ['hearing-notice', 'transit-notice', 'zoning-variance']);
    const sheets = await evaluate(send, `document.querySelectorAll('.home-desk > li').length`);
    if (sheets !== 3 || (await evaluate(send, `!!document.querySelector('.home-grid')`))) fail(`DESK  expected 3 loose sheets and no grid, got ${sheets}`);
    else note('under five documents the desk shows loose sheets, not the grid');
    await runAxe(send, '');
    await checkTree(send);
    await checkReflow(send);

    // Deleting from the editor: confirm, land on the homepage, and the doc is gone.
    // The native confirm() is stubbed; what's under test is what follows it.
    page = '/editor/transit-notice (delete)';
    await send('Page.navigate', { url: `${origin}/editor/transit-notice` });
    await sleep(1500);
    await evaluate(send, `window.confirm = () => true`);
    if (!(await focusByName(send, 'button', 'Delete document'))) fail('DELETE  the editor has no Delete document button');
    await key(send, 'Enter');
    await sleep(1500);
    const afterDelete = await evaluate(send, `({ path: location.pathname, stored: JSON.parse(localStorage.getItem('ada.docs.v1')).map((d) => d.id), sheets: document.querySelectorAll('.home-desk > li').length })`);
    const deleted = await liveText(send);
    if (afterDelete.path !== '/' || afterDelete.stored.includes('transit-notice') || afterDelete.sheets !== 2) fail(`DELETE  deleting did not remove the document and return home: ${JSON.stringify(afterDelete)}`);
    else if (!/^Deleted Transit Service Change Notice\./.test(deleted)) fail(`DELETE  deletion was not announced (got ${JSON.stringify(deleted)})`);
    else note('Delete document removes it, returns to the homepage and announces it');

    // Only the sample: the empty desk teaches instead.
    page = '/ (empty)';
    await keepDocs(send, ['hearing-notice']);
    const empty = await evaluate(send, `({ how: !!document.querySelector('.home-how'), sample: !!document.querySelector('a[href="/editor/hearing-notice"]'), search: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Find a document')) })`);
    if (!empty.how || !empty.sample || empty.search) fail(`EMPTY  the sample-only desk should teach, link the sample and hide search: ${JSON.stringify(empty)}`);
    else note('a desk holding only the sample shows the how-it-works state');
    await runAxe(send, '');
    await checkTree(send);
    await checkTabOrder(send);
    await checkReflow(send);

    // Removing the sample leaves a truly empty desk, which stays empty on reload.
    page = '/ (sample removed)';
    await evaluate(send, `window.confirm = () => true`);
    if (!(await focusByName(send, 'button', 'Remove the sample'))) fail('REMOVE  no Remove the sample button');
    await key(send, 'Enter');
    await sleep(600);
    const focusAfter = await evaluate(send, `document.activeElement?.id ?? ''`);
    if (focusAfter !== 'how-heading') fail(`REMOVE  focus fell to ${JSON.stringify(focusAfter)} instead of the heading`);
    await send('Page.reload');
    await sleep(1200);
    const gone = await evaluate(send, `({ how: !!document.querySelector('.home-how'), sample: !!document.querySelector('a[href="/editor/hearing-notice"]'), sheets: document.querySelectorAll('.home-sheet').length })`);
    if (!gone.how || gone.sample || gone.sheets !== 0) fail(`REMOVE  the sample came back or the empty state is wrong: ${JSON.stringify(gone)}`);
    else note('Remove the sample leaves an empty desk that stays empty after a reload');
    await runAxe(send, '');
    await checkTree(send);
    await checkReflow(send);
  } finally {
    await shutdown(send, ws, proc);
  }
}

/** Opens the + and picks an item from it. */
async function fromPlus(send, item) {
  if (!(await focusByName(send, 'button', 'New document'))) { fail('PLUS  no New document (+) button'); return false; }
  await key(send, 'Enter');
  await sleep(200);
  if (!(await focusByName(send, 'button', item))) { fail(`PLUS  the + does not offer ${JSON.stringify(item)}`); return false; }
  await key(send, 'Enter');
  await sleep(400);
  return true;
}

/* ---------- new document ---------- */

async function newDocument() {
  page = '/ (new document)';
  const { proc, ws, send } = await openPage('/');
  try {
    await evaluate(send, `localStorage.clear()`);
    await send('Page.reload');
    await sleep(1200);
    if (!(await fromPlus(send, 'Create a document'))) return;
    const inDialog = await evaluate(send, `!!document.activeElement?.closest('[role=dialog]')`);
    if (!inDialog) fail('NEWDOC  focus did not move into the dialog');
    await runAxe(send, ' (new document dialog)');
    await key(send, 'Enter'); // empty title
    await sleep(300);
    const err = await evaluate(send, `document.querySelector('[role=dialog] [role=alert]')?.textContent ?? ''`);
    if (!/title/.test(err)) fail(`NEWDOC  an empty title was not refused with a visible alert (got ${JSON.stringify(err)})`);
    await send('Input.insertText', { text: 'Board meeting minutes' });
    await key(send, 'Enter');
    await sleep(2000);
    const landed = await evaluate(send, `({ path: location.pathname, title: document.title, h1: document.querySelector('[aria-label="Document text"] h1')?.textContent ?? null })`);
    if (landed.path !== '/editor/board-meeting-minutes') fail(`NEWDOC  did not open the new document (at ${landed.path})`);
    else if (landed.h1 !== 'Board meeting minutes' || landed.title !== 'Board meeting minutes · Ada Editor') fail(`NEWDOC  the title is not the document's h1 and tab title (${JSON.stringify(landed)})`);
    else note('New document asks for a title, refuses an empty one, and opens with the title as its h1');
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
    if (!result.objectId) { fail('UPLOAD  no file input in the import dialog'); return false; }
    await send('DOM.setFileInputFiles', { objectId: result.objectId, files: [resolve(ROOT, file)] });
    return true;
  };
  try {
    await evaluate(send, `localStorage.clear()`);
    await send('Page.reload');
    await sleep(1200);
    if (!(await fromPlus(send, 'Import a Word file'))) return;

    // A file that is not a .docx: a visible, announced message, and nothing stored.
    if (!(await choose('corpus/docx/library-hours.source.html'))) return;
    await sleep(800);
    const alert = await evaluate(send, `document.querySelector('[role=dialog] [role=alert]')?.textContent ?? ''`);
    if (!alert.includes('isn’t a .docx')) fail(`UPLOAD  a non-.docx file gave no visible alert (got ${JSON.stringify(alert)})`);
    else note('a non-.docx upload shows a visible role=alert message');
    await runAxe(send, ' (import error shown)');

    // A real .docx (pandoc's): stored, opened, announced. Its table arrives as a
    // table, header row and all, so nothing is left out.
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
    if (!/^Imported Library hours notice\. .*blocking/.test(said) || /flattened|not imported/.test(said)) fail(`UPLOAD  announcement must name the document and what was found, and nothing was left out (got ${JSON.stringify(said)})`);
    else note(`upload announced: ${JSON.stringify(said)}`);
    const view = await evaluate(send, `({
      h1: document.querySelector('h1')?.textContent,
      notes: [...document.querySelectorAll('[aria-labelledby=import-notes-heading] li')].map((li) => li.textContent),
      headings: [...document.querySelectorAll('.ProseMirror h1, .ProseMirror h2, .ProseMirror h4')].length,
      lists: document.querySelectorAll('.ProseMirror ul, .ProseMirror ol').length,
      figures: document.querySelectorAll('.ProseMirror figure').length,
      tables: document.querySelectorAll('.ProseMirror table').length,
      headerCells: document.querySelectorAll('.ProseMirror table th').length,
    })`);
    if (view.h1 !== 'Library hours notice' || view.headings !== 4 || view.lists !== 3 || view.figures !== 2) fail(`UPLOAD  the imported document lost structure: ${JSON.stringify(view)}`);
    else note('the imported document keeps its headings, nested lists and images in the editor');
    if (view.tables !== 1 || view.headerCells !== 2) fail(`UPLOAD  the table did not arrive as a table with its header row: ${JSON.stringify(view)}`);
    else note('the Word table arrives as a table, with the header row Word marked');
    if (view.notes.length) fail(`UPLOAD  nothing was left out, but notes are shown: ${JSON.stringify(view.notes)}`);
    await runAxe(send, ' (imported document)');
    // The imported h2 -> h4 jump is the file's own finding, flagged by the engine.
    await checkTree(send, { contentTextbox: 'Document text' });

    // A file with something the editor can't hold (a table inside a table
    // cell): the notes are visible, not only announced.
    const scratch = mkdtempSync(join(tmpdir(), 'ada-upload-'));
    const nested = join(scratch, 'nested-table.docx');
    const cellXml = (inner) => `<w:tc>${inner}</w:tc>`;
    writeFileSync(nested, docx({
      title: 'Room guide',
      body: `<w:tbl><w:tr><w:trPr><w:tblHeader/></w:trPr>${cellXml(P(R('Floor')))}${cellXml(P(R('Rooms')))}</w:tr>`
        + `<w:tr>${cellXml(P(R('Second')))}${cellXml(`<w:tbl><w:tr>${cellXml(P(R('4B')))}${cellXml(P(R('Clinic')))}</w:tr></w:tbl><w:p/>`)}</w:tr></w:tbl>`,
    }));
    await send('Page.navigate', { url: `${origin}/` });
    await sleep(1500);
    if (!(await fromPlus(send, 'Import a Word file'))) return;
    if (!(await choose(nested))) return;
    path = '';
    for (let i = 0; i < 30 && !path.startsWith('/editor/'); i++) {
      await sleep(200);
      path = await evaluate(send, `location.pathname`);
    }
    page = path;
    await sleep(1500);
    const nestedSaid = await liveText(send);
    if (!/table inside a table cell flattened/.test(nestedSaid)) fail(`UPLOAD  the announcement must say what was not carried over (got ${JSON.stringify(nestedSaid)})`);
    const notes = await evaluate(send, `[...document.querySelectorAll('[aria-labelledby=import-notes-heading] li')].map((li) => li.textContent)`);
    rmSync(scratch, { recursive: true, force: true });
    if (notes.length !== 1 || !notes[0].includes('table inside a table cell')) fail(`UPLOAD  import notes are not visible on the page (${JSON.stringify(notes)})`);
    else note('what was not carried over is visible, not only announced');

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
    // SC 2.4.2: the tab names the open document. A server metadata title once
    // silently outranked this one, so every document read "Document".
    const docTitle = await evaluate(send, `document.title`);
    if (docTitle !== 'Notice of Public Hearing — Draft · Ada Editor') fail(`TITLE  document title is ${JSON.stringify(docTitle)}`);
    else note(`title: ${docTitle}`);
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

    await tables(send, findingCount);
    await images(send, findingCount);
    await dropAndShrink(send, findingCount);

    await checkReflow(send);
    await checkForcedColors(send);
    await checkExport(send);
  } finally {
    await shutdown(send, ws, proc);
  }
}

// Tables in the editor: the Table menu and dialog, Tab between cells and out,
// and a header row that retracts the blocker the moment it's on. Leaves a
// headed table in hearing-notice for the reflow, forced-colours and export checks.
async function tables(send, findingCount) {
  const selectIn = (js) => evaluate(send, `(() => {
    const d = document.getElementById('document-text');
    d.focus();
    const target = ${js};
    const r = document.createRange();
    r.selectNodeContents(target);
    r.collapse(false);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    return true;
  })()`);
  const inCell = () => evaluate(send, `(() => { const c = getSelection().anchorNode?.parentElement?.closest('th, td'); return c ? { tag: c.tagName, text: c.textContent, caption: c.closest('table')?.querySelector('caption')?.firstChild?.textContent ?? '' } : null; })()`);
  const menu = async (item) => {
    if (!(await focusByName(send, '[role=toolbar] button', 'Table'))) { fail('TABLE  no Table button in the toolbar'); return false; }
    await key(send, 'Enter');
    await sleep(200);
    const first = await evaluate(send, `document.activeElement?.getAttribute('role') === 'menuitem' && document.activeElement.textContent`);
    if (first !== 'Insert table…') fail(`TABLE  the Table menu did not open on its first item (focus: ${JSON.stringify(first)})`);
    if (!(await focusByName(send, '[role=menu] [role^=menuitem]', item))) { fail(`TABLE  the Table menu has no ${JSON.stringify(item)}`); return false; }
    await key(send, 'Enter');
    await sleep(300);
    return true;
  };

  // Insert from the end of the document.
  await selectIn(`[...d.querySelectorAll(':scope > p')].pop()`);
  await sleep(200);
  if (!(await menu('Insert table…'))) return;
  const inDialog = await evaluate(send, `!!document.activeElement?.closest('[role=dialog]')`);
  if (!inDialog) { fail('TABLE  Insert table did not move focus into a dialog'); return; }
  await runAxe(send, ' (insert table dialog)');
  if (!(await focusByName(send, '[role=dialog] input[type=text]', ''))) fail('TABLE  no caption field');
  await send('Input.insertText', { text: 'Hearing dates' });
  if (!(await focusByName(send, '[role=dialog] button', 'Insert table'))) { fail('TABLE  no Insert table button in the dialog'); return; }
  await key(send, 'Enter');
  await sleep(600);
  const said = await liveText(send);
  if (!/^Table inserted: 3 rows, 2 columns, with a header row\. Tab moves between cells\./.test(said)) fail(`TABLE  insertion not announced as expected (got ${JSON.stringify(said)})`);
  const start = await inCell();
  if (start?.tag !== 'TH' || start.caption !== 'Hearing dates') fail(`TABLE  the cursor did not land in the new table's first header cell (${JSON.stringify(start)})`);
  else note('Insert table: menu → dialog → a captioned table, announced, cursor in its first header cell');

  // Tab between cells, Shift-Tab back, Escape then Tab out.
  await send('Input.insertText', { text: 'Date' });
  await key(send, 'Tab');
  await send('Input.insertText', { text: 'Room' });
  await key(send, 'Tab');
  await send('Input.insertText', { text: 'May 4' });
  const typed = await inCell();
  await key(send, 'Tab', 8);
  const back = await inCell();
  if (typed?.tag !== 'TD' || typed.text !== 'May 4' || back?.text !== 'Room') fail(`TABLE  Tab/Shift-Tab did not move between cells (${JSON.stringify({ typed, back })})`);
  await key(send, 'Escape');
  await key(send, 'Tab');
  // Out of the editable text: the next stop may be a control inside the page
  // (the table's Edit caption button), as it is after a figure.
  const left = await evaluate(send, `({ out: document.activeElement !== document.getElementById('document-text'), at: document.activeElement?.textContent?.slice(0, 30) })`);
  if (!left.out) fail('TABLE  Escape then Tab did not leave the table (keyboard trap, WCAG 2.1.2)');
  else note(`Tab and Shift-Tab move between cells; Escape then Tab leaves the table (to ${JSON.stringify(left.at)})`);

  // Header row off: a blocker, announced. On again: gone.
  const before = await findingCount();
  await selectIn(`[...d.querySelectorAll('table')].find((t) => t.querySelector('caption')?.textContent.startsWith('Hearing dates')).querySelector('td p')`);
  await sleep(200);
  if (!(await menu('Header row'))) return;
  const off = await findingCount();
  const offSaid = await liveText(send);
  if (off !== before + 1 || !/^Header row off\./.test(offSaid)) fail(`TABLE  turning the header row off should add one finding and say so (${before} -> ${off}, ${JSON.stringify(offSaid)})`);
  const active = await evaluate(send, `document.querySelector('[aria-labelledby^=finding-] h3, h3[id^=finding-]')?.textContent ?? ''`);
  if (!(await menu('Header row'))) return;
  const on = await findingCount();
  if (on !== before) fail(`TABLE  turning the header row back on should retract the finding (${off} -> ${on})`);
  else note(`a table without header cells is a live blocker (active card: ${JSON.stringify(active)}); the header row retracts it`);

  await runAxe(send, ' (table in the document)');
  await checkTree(send, { contentTextbox: 'Document text' });
  // Let the debounced save land: the export reloads from storage.
  await sleep(1500);
}

// Real images: Insert image opens a file picker, the picture shows in the
// editor as a named image with its missing-alt blocker, a file that isn't an
// image is refused out loud, and the picture survives a reload (IndexedDB).
async function images(send, findingCount) {
  const dir = mkdtempSync(join(tmpdir(), 'ada-images-'));
  try {
    const chart = join(dir, 'visits-chart.png');
    writeFileSync(chart, png(120, 80));
    const fake = join(dir, 'not-a-picture.png');
    writeFileSync(fake, 'this is text, renamed .png');
    const choose = async (file) => {
      const { result } = await send('Runtime.evaluate', { expression: `document.querySelector('input[type=file][aria-label="Choose an image"]')` });
      if (!result.objectId) { fail('IMAGE  no image file input'); return false; }
      await send('DOM.setFileInputFiles', { objectId: result.objectId, files: [file] });
      await sleep(900);
      return true;
    };
    const figures = () => evaluate(send, `document.querySelectorAll('#document-text [data-figure-id]').length`);
    await evaluate(send, `(() => { const d = document.getElementById('document-text'); d.focus(); const p = [...d.querySelectorAll(':scope > p')].pop(); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
    await sleep(200);
    const before = { figures: await figures(), findings: await findingCount() };
    if (!(await focusByName(send, '[role=toolbar] button', 'Insert image'))) { fail('IMAGE  no Insert image button'); return; }
    if (!(await choose(chart))) return;
    const shown = await evaluate(send, `(() => { const art = [...document.querySelectorAll('#document-text [role=img]')].find((a) => a.querySelector('img')); const img = art?.querySelector('img'); return art ? { name: art.getAttribute('aria-label'), natural: img.naturalWidth, alt: img.getAttribute('alt') } : null; })()`);
    const said = await liveText(send);
    if (!shown || shown.natural !== 120 || shown.alt !== '' || !/visits-chart, no alternative text/.test(shown.name)) fail(`IMAGE  the chosen picture did not show as a named image (${JSON.stringify(shown)})`);
    else if ((await figures()) !== before.figures + 1 || (await findingCount()) !== before.findings + 1) fail('IMAGE  inserting added no figure or no missing-alt finding');
    else if (!/^Image inserted: visits-chart\. It has no alternative text yet/.test(said)) fail(`IMAGE  insertion not announced (got ${JSON.stringify(said)})`);
    else note('Insert image: the chosen picture shows, named, with its missing-alt blocker, announced');
    await runAxe(send, ' (real image)');

    const count = await figures();
    if (!(await choose(fake))) return;
    const alert = await evaluate(send, `[...document.querySelectorAll('[role=alert]')].map((a) => a.textContent).join(' ')`);
    if (!alert.includes('isn’t a PNG, JPEG, GIF or WebP') || (await figures()) !== count) fail(`IMAGE  a text file renamed .png was not refused visibly (${JSON.stringify(alert)})`);
    else note('a file that isn’t an image is refused with a visible alert, and nothing is inserted');

    // Kept in this browser: the picture is back after a reload.
    await sleep(1500);
    await send('Page.reload');
    await sleep(2000);
    const after = await evaluate(send, `(() => { const img = document.querySelector('#document-text [role=img] img'); return img ? img.naturalWidth : 0; })()`);
    if (after !== 120) fail(`IMAGE  the picture did not come back after a reload (naturalWidth ${after})`);
    else note('the picture survives a reload (kept in IndexedDB)');

    // Alt text, added the usual way, for the export check.
    if (!(await focusByName(send, '#document-text button', 'Add alt text for visits-chart'))) { fail('IMAGE  no Add alt text button on the inserted picture'); return; }
    await key(send, 'Enter');
    await sleep(300);
    if (!(await focusByName(send, '[role=dialog] textarea', ''))) { fail('IMAGE  the alt text dialog has no description field'); return; }
    await send('Input.insertText', { text: 'Chart of weekly visits' });
    if (!(await focusByName(send, '[role=dialog] button', 'Save alt text'))) { fail('IMAGE  no Save alt text button'); return; }
    await key(send, 'Enter');
    await sleep(1500);

    // A header logo: the same picker from the header/footer dialog, kept
    // with the document, flagged until it has alt text, and its alt text kept.
    const bandImg = () => evaluate(send, `(() => { const art = document.querySelector('[data-edge=header] [role=img]'); const img = art?.querySelector('img'); return art ? { name: art.getAttribute('aria-label'), natural: img?.naturalWidth ?? 0 } : null; })()`);
    const findingsBeforeLogo = await findingCount();
    if (!(await focusByName(send, '[role=toolbar] button', 'Edit header and footer'))) { fail('IMAGE  no header and footer button'); return; }
    await key(send, 'Enter');
    await sleep(400);
    if (!(await focusByName(send, '[role=dialog] button', 'Insert logo or image in header'))) { fail('IMAGE  the header dialog has no Insert logo button'); return; }
    await key(send, 'Enter');
    await sleep(200);
    if (!(await choose(chart))) return;
    await key(send, 'Escape');
    await sleep(1500);
    const logo = await bandImg();
    if (logo?.natural !== 120 || !/header image, no alternative text/.test(logo.name) || (await findingCount()) !== findingsBeforeLogo + 1) fail(`IMAGE  the header logo did not show, flagged (${JSON.stringify(logo)})`);
    await send('Page.reload');
    await sleep(2000);
    const kept = await bandImg();
    if (kept?.natural !== 120 || (await findingCount()) !== findingsBeforeLogo + 1) fail(`IMAGE  the header logo, or its finding, did not survive a reload (${JSON.stringify(kept)})`);
    else note('a header logo shows in the band, flagged until it has alt text, and survives a reload');
    if (!(await focusByName(send, '[role=toolbar] button', 'Edit header and footer'))) return;
    await key(send, 'Enter');
    await sleep(400);
    if (!(await focusByName(send, '[role=dialog] button', 'Add header image alt text'))) { fail('IMAGE  no Add header image alt text button'); return; }
    await key(send, 'Enter');
    await sleep(400);
    if (!(await focusByName(send, '[role=dialog] textarea', ''))) { fail('IMAGE  no alt text field for the header image'); return; }
    await send('Input.insertText', { text: 'City seal' });
    await focusByName(send, '[role=dialog] button', 'Save alt text');
    await key(send, 'Enter');
    await sleep(300);
    await key(send, 'Escape');
    await sleep(1500);
    await send('Page.reload');
    await sleep(2000);
    const labelled = await bandImg();
    if (labelled?.name !== 'City seal' || (await findingCount()) !== findingsBeforeLogo) fail(`IMAGE  the header logo's alt text was not kept across a reload (${JSON.stringify(labelled)})`);
    else note('the header logo’s alt text is saved with the document and clears its finding');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Drag and drop, and large photos: files dropped on the page land where
// they're dropped (several in order), a dropped file that isn't a picture is
// refused out loud, and a photo over 2400 px is stored shrunk, and says so.
async function dropAndShrink(send, findingCount) {
  const b64 = (bytes) => Buffer.from(bytes).toString('base64');
  // A drop at the end of the first paragraph, as the browser sends one.
  const drop = (files) => evaluate(send, `(() => {
    const d = document.getElementById('document-text');
    const p = d.querySelector(':scope > p');
    p.scrollIntoView({ block: 'center' });
    const r = p.getBoundingClientRect();
    const dt = new DataTransfer();
    for (const [name, type, data] of ${JSON.stringify(files)}) dt.items.add(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name, { type }));
    d.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.right - 2, clientY: r.bottom - 4 }));
  })()`);
  const afterFirst = (n) => evaluate(send, `(() => { const out = []; let el = document.querySelector('#document-text > p'); for (let i = 0; i < ${n}; i++) { el = el?.nextElementSibling; out.push(el?.matches('[data-figure-id]') ? el.querySelector('[role=img]').getAttribute('aria-label') : el?.tagName); } return out; })()`);
  const settle = async (want) => { for (let i = 0; i < 40; i++) { if ((await findingCount()) === want) return true; await sleep(200); } return false; };

  let findings = await findingCount();
  await drop([['dropped-one.png', 'image/png', b64(png(60, 40))], ['dropped-two.png', 'image/png', b64(png(40, 60))]]);
  const landed = (await settle(findings + 2)) && await afterFirst(2);
  const said = await liveText(send);
  if (!landed || !/^dropped-one, no alternative text/.test(landed[0]) || !/^dropped-two, no alternative text/.test(landed[1])) fail(`DROP  two dropped pictures did not land, in order, where they were dropped (${JSON.stringify(landed)})`);
  else if (!/^Image inserted: dropped-two\. It has no alternative text yet/.test(said)) fail(`DROP  the drop was not announced (got ${JSON.stringify(said)})`);
  else note('dropped pictures land where they are dropped, in order, each flagged for alt text, announced');
  await runAxe(send, ' (dropped images)');

  findings = await findingCount();
  const figures = await evaluate(send, `document.querySelectorAll('#document-text [data-figure-id]').length`);
  await drop([['notes.txt', 'text/plain', b64(Buffer.from('not a picture'))]]);
  await sleep(500);
  const alert = await evaluate(send, `[...document.querySelectorAll('[role=alert]')].map((a) => a.textContent).join(' ')`);
  if (!alert.includes('isn’t a PNG, JPEG, GIF or WebP') || (await evaluate(send, `document.querySelectorAll('#document-text [data-figure-id]').length`)) !== figures) fail(`DROP  a dropped text file was not refused visibly (${JSON.stringify(alert)})`);
  else note('a dropped file that isn’t a picture is refused with a visible alert, and nothing is inserted');

  // 3000×2000: stored at 2400×1600, and the announcement says it was resized.
  await drop([['big-photo.png', 'image/png', b64(png(3000, 2000))]]);
  await settle(findings + 1);
  await sleep(300);
  const big = await evaluate(send, `(() => { const f = [...document.querySelectorAll('#document-text [data-figure-id]')].find((x) => x.querySelector('[role=img]')?.getAttribute('aria-label')?.startsWith('big-photo')); const img = f?.querySelector('img'); return img ? { natural: img.naturalWidth, h: img.naturalHeight } : null; })()`);
  const resized = await liveText(send);
  if (big?.natural !== 2400 || big?.h !== 1600) fail(`SHRINK  a 3000×2000 picture was not stored at 2400×1600 (${JSON.stringify(big)})`);
  else if (!/^Image inserted: big-photo, resized to 2400 by 1600 pixels\./.test(resized)) fail(`SHRINK  the resize was not announced (got ${JSON.stringify(resized)})`);
  else note('a picture over 2400 px is stored at 2400 px on its longer side, and the announcement says so');
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

    await checkPdfExport(send, dir);

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
    // Unlabelled figures: placeholders (role-img-alt) and real pictures (image-alt).
    for (const v of violations.filter((x) => x.id !== 'role-img-alt' && x.id !== 'image-alt')) fail(`EXPORT  axe: ${v.id} x${v.nodes} in the exported page`);
    const unnamed = violations.filter((v) => v.id === 'role-img-alt' || v.id === 'image-alt').reduce((n, v) => n + v.nodes, 0);
    if (unnamed !== missingAlt) fail(`EXPORT  ${unnamed} unnamed images exported, but the editor showed ${missingAlt} missing alt text`);
    else note(`exported page: axe clean apart from the ${missingAlt} image(s) the editor flags as missing alt`);
    const table = await evaluate(send, `(() => { const t = [...document.querySelectorAll('table')].find((x) => x.querySelector('caption')?.textContent === 'Hearing dates'); return t ? { th: [...t.querySelectorAll('thead th[scope=col]')].map((c) => c.textContent), rows: t.querySelectorAll('tr').length } : null; })()`);
    if (!table || table.th.join('|') !== 'Date|Room' || table.rows !== 3) fail(`EXPORT  the table from the editor did not reach the page with its header row (${JSON.stringify(table)})`);
    else note('the table exports with its caption and scoped header row, axe clean');
    const picture = await evaluate(send, `(() => { const img = [...document.querySelectorAll('figure.image img')].find((i) => i.getAttribute('alt') === 'Chart of weekly visits'); return img ? { data: img.getAttribute('src').startsWith('data:image/png;base64,'), alt: img.getAttribute('alt'), natural: img.naturalWidth } : null; })()`);
    if (!picture?.data || picture.alt !== 'Chart of weekly visits' || picture.natural !== 120) fail(`EXPORT  the inserted picture did not export with its alt text (${JSON.stringify(picture)})`);
    else note('the inserted picture exports inside the page, with the alt text added in the editor');
    const logo = await evaluate(send, `document.querySelector('header img')?.getAttribute('alt') ?? null`);
    if (logo !== 'City seal') fail(`EXPORT  the header logo did not export with its alt text (${JSON.stringify(logo)})`);
    else note('the header logo exports in the page’s <header>, with its alt text');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ---------- status screens ---------- */

// One shared StatusScreen renders the error boundary (app/error.tsx), unknown
// URLs (app/not-found.tsx) and missing documents. The error boundary has no
// deterministic trigger in a production build, so it is covered through the
// two screens that do: same component, same markup, same focus handling.
async function statusScreens() {
  for (const [path, title] of [['/editor/does-not-exist', 'Document not found'], ['/no-such-page', 'Page not found']]) {
    page = path;
    const { proc, ws, send } = await openPage(path);
    try {
      await runAxe(send, '');
      await checkTree(send);
      const focused = await evaluate(send, `document.activeElement?.tagName === 'H1' && document.activeElement.textContent`);
      if (focused !== title) fail(`FOCUS  focus is not on the "${title}" heading (got ${JSON.stringify(focused)})`);
      else note('focus lands on the heading');
      const docTitle = await evaluate(send, `document.title`);
      if (docTitle !== `${title} · Ada Editor`) fail(`TITLE  document title is ${JSON.stringify(docTitle)}`);
      else note(`title: ${docTitle}`);
      if (!(await focusByName(send, 'a', 'Back to all documents'))) fail('STATUS  no way back to all documents');
      await checkTabOrder(send);
      await checkReflow(send);
      await checkForcedColors(send);
    } finally {
      await shutdown(send, ws, proc);
    }
  }
}

/* ---------- sign-in ---------- */

// CI builds in local mode (no Supabase env vars), so the gate never reaches a
// real account — but the screen renders the same, and submitting takes the
// same visible, announced error path a failed send would.
async function signIn() {
  page = '/sign-in';
  const { proc, ws, send } = await openPage(page);
  try {
    await runAxe(send, '');
    await checkTree(send);
    const docTitle = await evaluate(send, `document.title`);
    if (docTitle !== 'Sign in · Ada Editor') fail(`TITLE  document title is ${JSON.stringify(docTitle)}`);
    await checkTabOrder(send);
    if (!(await focusByName(send, 'input', ''))) fail('SIGNIN  no email field');
    await send('Input.insertText', { text: 'person@example.org' });
    await key(send, 'Enter');
    await sleep(400);
    const alert = await evaluate(send, `document.querySelector('.signin [role=alert]')?.textContent ?? ''`);
    if (!/isn’t set up/.test(alert)) fail(`SIGNIN  submitting did not show a visible alert (got ${JSON.stringify(alert)})`);
    else note('a failed sign-in shows a visible role=alert message');
    await runAxe(send, ' (error shown)');
    await checkReflow(send);
    await checkForcedColors(send);
  } finally {
    await shutdown(send, ws, proc);
  }
}

/* ---------- privacy notice ---------- */

// Public page (readable before signing up). In local mode the account actions
// (message form, delete account) don't render: there are no accounts.
async function privacyPage() {
  page = '/privacy';
  const { proc, ws, send } = await openPage(page);
  try {
    await runAxe(send, '');
    await checkTree(send);
    const docTitle = await evaluate(send, `document.title`);
    if (docTitle !== 'Privacy · Ada Editor') fail(`TITLE  document title is ${JSON.stringify(docTitle)}`);
    else note(`title: ${docTitle}`);
    if (!(await focusByName(send, 'a', 'Back to Ada Editor'))) fail('PRIVACY  no way back to the app');
    await checkTabOrder(send);
    await checkReflow(send);
    await checkForcedColors(send);
  } finally {
    await shutdown(send, ws, proc);
  }
}

// PDF export in the real app: PDFKit's browser build and the fonts served
// from public/ (scripts/verify-pdf.mjs validates the file itself against
// PDF/UA-1). Then a document the font can't draw: refused, visibly and aloud.
async function checkPdfExport(send, dir) {
  if (!(await focusByName(send, 'button', 'Export PDF'))) { fail('PDF  no Export PDF button'); return; }
  await key(send, 'Enter');
  let file;
  for (let i = 0; i < 50 && !file; i++) {
    await sleep(200);
    file = readdirSync(dir).find((f) => f.endsWith('.pdf'));
  }
  if (!file) { fail(`PDF  no .pdf file was downloaded (dir: ${JSON.stringify(readdirSync(dir))}, said: ${JSON.stringify(await liveText(send))})`); return; }
  const bytes = readFileSync(join(dir, file));
  if (!bytes.subarray(0, 8).toString('latin1').startsWith('%PDF-1.7') || !bytes.includes('<pdfuaid:part>1</pdfuaid:part>')) fail('PDF  the download is not a PDF/UA-identified PDF');
  else note(`PDF downloaded: ${file}, ${bytes.length} bytes`);
  // The announcer clears, then speaks 60ms later: wait for the words, not the file.
  const saidMatching = async (re) => {
    let text = '';
    for (let i = 0; i < 25 && !re.test(text); i++) {
      text = await liveText(send);
      if (!re.test(text)) await sleep(100);
    }
    return text;
  };
  const said = await saidMatching(/^Exported hearing-notice\.pdf\./);
  if (!/^Exported hearing-notice\.pdf\. .*review/.test(said)) fail(`PDF  announcement must name the file and what remains (got ${JSON.stringify(said)})`);
  else note(`PDF export announced: ${JSON.stringify(said)}`);

  await evaluate(send, `(() => {
    const docs = JSON.parse(localStorage.getItem('ada.docs.v1'));
    docs.find((d) => d.id === 'hearing-notice').header = 'Готово';
    localStorage.setItem('ada.docs.v1', JSON.stringify(docs));
  })()`);
  await send('Page.reload');
  await sleep(1200);
  if (!(await focusByName(send, 'button', 'Export PDF'))) { fail('PDF  no Export PDF button after reload'); return; }
  await key(send, 'Enter');
  let card = null;
  for (let i = 0; i < 50 && !card; i++) {
    await sleep(200);
    card = await evaluate(send, `document.getElementById('pdf-missing-heading')?.closest('section')?.textContent ?? null`);
  }
  if (!card || !card.includes('Г')) fail(`PDF  a refused export must say so on screen, naming the characters (card: ${JSON.stringify(card)})`);
  else note('refused PDF export shown in the findings panel, naming the characters');
  const refused = await saidMatching(/^PDF not exported/);
  if (!/^PDF not exported/.test(refused)) fail(`PDF  a refused export must be announced (got ${JSON.stringify(refused)})`);
  if (readdirSync(dir).filter((f) => f.endsWith('.pdf')).length !== 1) fail('PDF  a refused export still downloaded a file');
  await evaluate(send, AXE);
  const violations = JSON.parse(await evaluate(send, `
    axe.run(document.getElementById('pdf-missing-heading').closest('section'), { runOnly: { type: 'tag', values: ${JSON.stringify(AXE_TAGS)} } })
      .then((r) => JSON.stringify(r.violations.map((v) => v.id)))
  `));
  if (violations.length) fail(`PDF  axe on the refusal notice: ${violations.join(', ')}`);
}

try {
  await privacyPage();
  await signIn();
  await home();
  await newDocument();
  await upload();
  await triage();
  await language();
  await editor();
  await statusScreens();
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
