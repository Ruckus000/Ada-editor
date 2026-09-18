#!/usr/bin/env node
/**
 * Screen reader gate: drives Orca against the rendered components and asserts on
 * what it actually says.
 *
 * `verify-a11y.mjs` checks the accessibility tree — what the browser hands
 * assistive technology. This checks the layer above: what a real screen reader
 * does with that tree. The distinction is not academic. The tree-level gate
 * passed while activating a finding's button dropped focus to <body>, so Orca
 * announced the document instead of the outcome and the user lost their place.
 * Only running the screen reader found it.
 *
 * Linux only, and needs the AT-SPI stack from scripts/a11y-stack.sh. Exits 0
 * with a SKIPPED notice where it cannot run, so it is safe in a mixed CI matrix.
 *
 *   ./scripts/a11y-stack.sh &        # Xvfb + dbus + AT-SPI bus + registry
 *   node scripts/verify-orca.mjs [--verbose]
 */

import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { serve } from './serve-preview.mjs';
import { findChrome } from './find-chrome.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const VERBOSE = process.argv.includes('--verbose');
const SPEECH_LOG = '/tmp/orca-gate-speech.log';
const ORCA_PY = '/usr/bin/python3.12';

// Node 20 has no global WebSocket, and CDP needs one. Fail with a sentence
// rather than a bare ReferenceError three frames deep.
if (typeof WebSocket === 'undefined') {
  console.error(`This gate needs Node 22 or newer for the global WebSocket (running ${process.version}).`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const notes = [];
const fail = (m) => failures.push(m);
const note = (m) => notes.push('  ok  ' + m);

const skip = (why) => {
  console.log('Orca screen reader gate\n');
  // In CI a skip is a failure. This gate silently skipped every CI run for want
  // of a Chromium path and reported success for a screen reader test that never
  // ran — the precise failure mode it exists to catch in the components.
  if (process.env.CI) {
    console.error(`FAILED — the gate could not run: ${why}`);
    console.error('CI is where this must run, so a skip here is a failure.');
    process.exit(1);
  }
  console.log(`SKIPPED — ${why}`);
  console.log('This gate needs Linux, Orca, and the AT-SPI stack (scripts/a11y-stack.sh).');
  console.log('Tree-level checks still run in scripts/verify-a11y.mjs.');
  process.exit(0);
};

/* ---------- preconditions ---------- */

if (process.platform !== 'linux') skip(`platform is ${process.platform}`);
if (!existsSync('/usr/bin/orca')) skip('Orca is not installed');
if (!process.env.DISPLAY) skip('no DISPLAY; start scripts/a11y-stack.sh first');

const have = (bin) => {
  try { execFileSync('which', [bin], { stdio: 'pipe' }); return true; } catch { return false; }
};
if (!have('xdotool')) skip('xdotool is not installed');

const CHROME = findChrome();
if (!CHROME) skip('no Chromium binary found; set CHROME_PATH');

/* ---------- speech capture ---------- */

/** Orca records every utterance in its debug log, which is how speech is read without audio. */
const spoken = () => {
  let text;
  try { text = readFileSync(SPEECH_LOG, 'utf8'); } catch { return []; }
  return [...text.matchAll(/SPEECH OUTPUT: '(.*?)' \{/g)].map((m) => m[1]);
};

/** Utterances produced since a marker index. */
const since = (index) => spoken().slice(index);

const key = (k) => {
  execFileSync('xdotool', ['key', '--clearmodifiers', k], { stdio: 'pipe' });
};

/**
 * Wait until the screen reader says something new, rather than sleeping a fixed
 * guess. A CI runner is slower than a laptop, and a fixed wait produced
 * "Orca said: []" — a failure that was entirely about timing.
 */
const waitForSpeech = async (from, timeoutMs = 12_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (spoken().length > from) {
      // Let the utterance finish rather than reading the first fragment.
      await sleep(1200);
      return true;
    }
    await sleep(300);
  }
  return false;
};

const said = (list, fragment) =>
  list.some((u) => u.toLowerCase().includes(fragment.toLowerCase()));

/* ---------- run ---------- */

const { server, origin } = await serve();
rmSync(SPEECH_LOG, { force: true });

// Kill any leftover instance first. A previous run's browser is still on the
// display, and xdotool would hand us that window instead — a stale page whose
// findings were already dismissed, which silently invalidates every assertion.
try { execFileSync('pkill', ['-f', 'chrome-orca-gate'], { stdio: 'pipe' }); } catch { /* none */ }
await sleep(1500);
rmSync('/tmp/chrome-orca-gate', { recursive: true, force: true });

const chrome = spawn(CHROME, [
  '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--force-renderer-accessibility',
  '--window-size=1500,900', '--window-position=0,0',
  '--user-data-dir=/tmp/chrome-orca-gate',
  `${origin}/preview.html`,
], { stdio: 'ignore' });

const orca = spawn(ORCA_PY, ['/usr/bin/orca', '--replace', '--debug', `--debug-file=${SPEECH_LOG}`], {
  stdio: 'ignore',
});

try {
  // Orca takes a while to attach to the accessibility bus and start speaking.
  for (let i = 0; i < 40 && spoken().length === 0; i++) await sleep(1000);
  if (spoken().length === 0) {
    fail('ORCA  produced no speech at all — it did not attach to the browser');
    throw new Error('orca-silent');
  }
  note(`Orca attached and spoke ${spoken().length} phrase(s) on load`);

  // Select the window by OUR process id, not by class: matching on class picks
  // the first chromium on the display, which may not be the one we launched.
  // --onlyvisible: Chromium maps several X windows per process, most of them
  // unmapped helpers that cannot take focus.
  let win = '';
  for (let i = 0; i < 24 && !win; i++) {
    for (const args of [
      ['search', '--onlyvisible', '--pid', String(chrome.pid)],
      ['search', '--onlyvisible', '--class', 'chromium'],
    ]) {
      try {
        const candidates = execFileSync('xdotool', args, { encoding: 'utf8', stdio: 'pipe' })
          .trim().split('\n').filter(Boolean);
        for (const candidate of candidates.reverse()) {
          // windowactivate needs a window manager (the stack now starts openbox);
          // windowfocus is the fallback for a bare Xvfb, where activate errors
          // with "your windowmanager claims not to support _NET_ACTIVE_WINDOW".
          for (const verb of ['windowactivate', 'windowfocus']) {
            try {
              execFileSync('xdotool', [verb, candidate], { stdio: 'pipe' });
              win = candidate;
              break;
            } catch { /* try the next verb */ }
          }
          if (win) break;
        }
      } catch { /* nothing matched yet */ }
      if (win) break;
    }
    if (!win) await sleep(500);
  }
  if (!win) { fail('ORCA  could not focus the browser window'); throw new Error('no-window'); }

  // Wait for the window to carry the page title. In CI Orca announced a bare
  // "Chromium frame." where locally it says "Ada-editor design system preview -
  // Chromium frame." — a titleless window means the gate started driving before
  // the page was in it, or activated the wrong one of several Chromium windows.
  let title = '';
  for (let i = 0; i < 30; i++) {
    try {
      title = execFileSync('xdotool', ['getwindowname', win], { encoding: 'utf8', stdio: 'pipe' }).trim();
    } catch { title = ''; }
    if (/design system preview/i.test(title)) break;
    await sleep(1000);
  }
  if (!/design system preview/i.test(title)) {
    fail(`ORCA  the activated window is titled ${JSON.stringify(title)}, not the preview page`);
    throw new Error('wrong-window');
  }
  note(`activated the window titled ${JSON.stringify(title)}`);
  await sleep(1500);

  /**
   * Can assistive technology actually see the browser?
   *
   * Orca reads the AT-SPI tree. On a CI runner it attached, announced the frame
   * title and then said nothing more — which looks like a navigation problem but
   * is really "there was nothing to read". This asks AT-SPI directly for our own
   * page content, so the gate fails on the true cause instead of driving blind.
   *
   * It searches for text rather than counting nodes: a first version counted to
   * a depth of four and reported 16 on a tree that is genuinely large, because
   * the findings sit about eight levels down.
   */
  const atspiProbe = `
import gi
gi.require_version('Atspi','2.0')
from gi.repository import Atspi

TARGETS = ('accessibility findings', 'design system preview', 'quarterly report')

def find(node, depth=0):
    if depth > 14:
        return False
    try:
        name = (node.get_name() or '').lower()
    except Exception:
        return False
    if any(t in name for t in TARGETS):
        return True
    try:
        for i in range(node.get_child_count()):
            if find(node.get_child_at_index(i), depth + 1):
                return True
    except Exception:
        pass
    return False

desktop = Atspi.get_desktop(0)
for i in range(desktop.get_child_count()):
    app = desktop.get_child_at_index(i)
    try:
        if 'chrom' in (app.get_name() or '').lower() and find(app):
            print('found')
            break
    except Exception:
        pass
else:
    print('missing')
`;
  let atspiSeesPage = false;
  for (let i = 0; i < 25 && !atspiSeesPage; i++) {
    try {
      atspiSeesPage =
        execFileSync(ORCA_PY, ['-c', atspiProbe], { encoding: 'utf8', stdio: 'pipe' }).trim() === 'found';
    } catch { /* bus not ready */ }
    if (!atspiSeesPage) await sleep(1000);
  }
  if (!atspiSeesPage) {
    fail('ATSPI  the page content is not in the accessibility tree — assistive ' +
         'technology cannot see it, so nothing below would be measuring the components');
    throw new Error('atspi-empty');
  }
  note('AT-SPI exposes the page content to assistive technology');

  // Guard: every assertion below assumes a full set of findings.
  const loaded = spoken();
  const countLine = loaded.find((u) => /Accessibility findings \((\d+)\)/.test(u));
  const found = countLine ? Number(countLine.match(/\((\d+)\)/)[1]) : null;
  if (found !== null && found < 4) {
    fail(`ORCA  page loaded with only ${found} findings; the session is stale and its assertions are meaningless`);
    throw new Error('stale-page');
  }

  /**
   * Do key events reach the browser at all?
   *
   * Every content check below drives the keyboard, so if keys go nowhere they
   * all fail together and describe symptoms rather than the cause — which is
   * exactly what the previous CI run produced. One keypress, one answer.
   */
  // `xdotool key` delivers through XTEST to whatever holds X INPUT focus, which
  // is not necessarily the window we activated. Check, and say so if they differ
  // — that distinguishes "keys go to the wrong window" from "keys go nowhere".
  let focused = '';
  try {
    focused = execFileSync('xdotool', ['getwindowfocus'], { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch { focused = 'none'; }
  if (focused !== win) {
    note(`X input focus is window ${focused}, not the activated ${win} — retargeting`);
    try { execFileSync('xdotool', ['windowfocus', '--sync', win], { stdio: 'pipe' }); } catch { /* best effort */ }
    await sleep(800);
    try {
      focused = execFileSync('xdotool', ['getwindowfocus'], { encoding: 'utf8', stdio: 'pipe' }).trim();
    } catch { /* keep previous */ }
  }
  note(`X input focus: ${focused}${focused === win ? ' (the browser)' : ' (NOT the browser)'}`);

  let inputReaches = false;
  // Several keys, because this asks whether input ARRIVES, not what any one key
  // means. A single Tab is a poor probe: depending on where focus starts it can
  // legitimately move to something Orca does not announce.
  for (const probeKey of ['ctrl+Home', 'h', 'Down', 'Tab']) {
    const beforeKey = spoken().length;
    key(probeKey);
    if (await waitForSpeech(beforeKey, 6_000)) { inputReaches = true; break; }
  }
  if (!inputReaches) {
    fail('INPUT  four different keypresses produced no speech at all, with X input ' +
         `focus on ${focused} and the browser window ${win}. ` +
         (focused === win
           ? 'Focus is correct, so XTEST synthetic input is not reaching the renderer.'
           : 'Focus is on the wrong window, so the keys went elsewhere.') +
         ' Nothing below would be measuring the components.');
    throw new Error('no-input');
  }
  note('key events reach the browser and Orca responds to them');

  /* --- Step 1: findings reachable by heading, announced with level --- */
  let mark = spoken().length;
  for (let i = 0; i < 6; i++) { key('h'); await sleep(1100); }
  const headings = since(mark);
  const levelled = headings.filter((u) => /heading level \d/i.test(u));
  if (levelled.length < 4) {
    fail(`SR-HEADINGS  only ${levelled.length} headings announced with a level; findings must be reachable by heading`);
  } else {
    note(`heading navigation reaches ${levelled.length} headings, announced with level`);
  }

  /* --- Step 2: severity announced as words, not colour ---
   * Read down through the findings from the top. ctrl+Home first: after the
   * heading pass the caret has wrapped to the end of the document, and reading
   * from there starts mid-card and skips the badge entirely — which made this
   * check report a failure that was an artefact of caret position. */
  key('ctrl+Home');
  await sleep(1200);
  mark = spoken().length;
  for (let i = 0; i < 14; i++) { key('Down'); await sleep(700); }
  const all = spoken();
  const severityWords = ['Blocks access', 'Fails AA', 'Advisory', 'Needs your call'];
  const announced = severityWords.filter((w) => said(all, w));
  if (announced.length === 0) {
    fail('SR-SEVERITY  no severity label was ever announced — with colour unavailable, nothing conveys severity');
  } else {
    note(`severity announced as words: ${announced.join(', ')}`);
  }

  /* --- Step 5: arrow keys belong to the screen reader, not to us --- */
  const arrows = since(mark);
  if (arrows.length === 0) {
    fail('SR-ARROWS  arrow keys produced no speech; browse-mode reading may be broken');
  } else {
    note(`arrow keys read content in browse mode (${arrows.length} phrases) rather than moving cards`);
  }

  /* --- Step 3: buttons carry distinct, self-describing names ---
   * Orca's structural navigation (`b` = next button) rather than Tab: Tab's
   * landing point depends on where the caret happens to be, which made this
   * check flaky. `b` is deterministic from anywhere in the document. */
  mark = spoken().length;
  for (let i = 0; i < 7; i++) { key('b'); await sleep(900); }
  const tabbed = since(mark).filter((u) => /push button/i.test(u));
  const names = new Set(tabbed.map((u) => u.replace(/\s*push button\.?$/i, '').trim()));
  const bare = [...names].filter((n) => /^(dismiss|apply fix)$/i.test(n));
  if (bare.length) {
    fail(`SR-BUTTONS  ${bare.join(', ')} announced without naming its finding — ` +
         'indistinguishable when navigating by button');
  } else if (names.size < 2) {
    fail(`SR-BUTTONS  only ${names.size} button(s) announced; expected the findings' actions`);
  } else {
    note(`${names.size} buttons announced with distinct, self-describing names`);
  }

  /* --- Step 6: no keyboard trap. Tabbing on must eventually leave the page. --- */
  mark = spoken().length;
  for (let i = 0; i < 8; i++) { key('Tab'); await sleep(700); }
  const escaped = since(mark);
  if (said(escaped, 'address') || said(escaped, 'search bar') || said(escaped, 'tool bar')) {
    note('no keyboard trap: Tab eventually leaves the page for browser chrome');
  } else {
    fail('SR-TRAP  Tab never left the findings list; a keyboard trap is likely (SC 2.1.2)');
  }

  /* --- Step 4: activating a finding keeps the user's place --- */
  // Re-enter the content, land on a finding's button, activate it.
  key('F5');
  // Reload, then wait for Orca to finish announcing the fresh page.
  await sleep(2000);
  await waitForSpeech(spoken().length, 20_000);
  await sleep(2000);
  // Seek a button that actually REMOVES the finding. Since the rule-set spike
  // the first button in a card is "Go to text", which deliberately leaves the
  // card in place, so stopping at the first button would test nothing.
  let onRemover = false;
  for (let i = 0; i < 6 && !onRemover; i++) {
    key('b');
    await sleep(1300);
    const last = spoken().at(-1) ?? '';
    onRemover = /apply fix|dismiss/i.test(last);
  }
  if (!onRemover) fail('SR-FOCUS  never reached an Apply fix or Dismiss button');
  mark = spoken().length;
  key('Return');
  const respondedToActivation = await waitForSpeech(mark, 15_000);
  if (!respondedToActivation) {
    fail('SR-FOCUS  Orca said nothing at all after activating the finding; ' +
         'either the activation never landed or speech did not arrive in time');
  }
  await sleep(1500);
  const after = since(mark);
  const lostPlace = after.some((u) => /document web|chromium$/i.test(u));
  const keptPlace = after.some((u) => /heading level 3|clickable|tells a user|reads at|screen readers will/i.test(u));
  if (lostPlace && !keptPlace) {
    fail('SR-FOCUS  after activating a finding, Orca announced the document — ' +
         'focus was destroyed and the user lost their place in the list');
  } else if (keptPlace) {
    note('after activating a finding, Orca announces the next finding — focus survives');
  } else {
    fail(`SR-FOCUS  could not confirm focus survived activation; Orca said: ${JSON.stringify(after.slice(0, 3))}`);
  }
} catch (error) {
  if (!['orca-silent', 'stale-page', 'no-window', 'atspi-empty', 'wrong-window', 'no-input']
        .includes(error.message)) {
    fail(`ORCA  gate error: ${error.message}`);
  }
} finally {
  orca.kill();
  chrome.kill();
  server.close();
}

console.log('Orca screen reader gate\n');
if (VERBOSE) {
  console.log(notes.join('\n'));
  console.log('\n--- everything Orca said ---');
  for (const u of spoken()) console.log('    ' + JSON.stringify(u));
  console.log();
}
if (failures.length) {
  console.error(`FAILED (${failures.length})\n`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`PASSED — ${notes.length} checks, 0 failures.`);
console.log('Orca only. NVDA, JAWS and VoiceOver have different browse-mode');
console.log('semantics; see docs/design-system/screen-reader-test-plan.md.');
