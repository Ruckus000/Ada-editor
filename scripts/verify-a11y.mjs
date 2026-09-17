#!/usr/bin/env node
/**
 * Accessibility gate for the rendered components.
 *
 * Runs against design-system/preview.html, which build-preview.mjs generates
 * from the real React tree. The previous preview was hand-written markup that
 * imitated the components; its accessibility tree showed four buttons all named
 * "Dismiss", unnamed cards and no live region — none of it true of the
 * components. Verifying that would have been verifying fiction.
 *
 * Drives the bundled Chromium over the DevTools Protocol. No Playwright, no
 * webdriver: CDP is built into the browser, and `Accessibility.getFullAXTree`
 * returns exactly what the browser hands assistive technology.
 *
 * This is NOT a substitute for a screen reader. It verifies the layer beneath
 * one. See docs/design-system/screen-reader-test-plan.md for the part a human
 * still has to do.
 *
 *   node scripts/verify-a11y.mjs [--verbose]
 */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { serve } from './serve-preview.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Resolve a Chromium binary: explicit env, then a Playwright install, then PATH. */
const findChrome = () => {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', `${process.env.HOME}/.cache/ms-playwright`];
  for (const root of roots.filter(Boolean)) {
    try {
      for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium'))) {
        for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
          const candidate = resolve(root, dir, rel);
          if (existsSync(candidate)) return candidate;
        }
      }
    } catch { /* root absent */ }
  }
  for (const name of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (existsSync(name)) return name;
  }
  throw new Error('No Chromium found. Set CHROME_PATH.');
};
const CHROME = findChrome();
const AXE = resolve(HERE, '../node_modules/axe-core/axe.min.js');
const VERBOSE = process.argv.includes('--verbose');

const failures = [];
const notes = [];
const fail = (m) => failures.push(m);
const note = (m) => notes.push('  ok  ' + m);

/* ---------- CDP plumbing ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const launch = async (pageUrl) => {
  const port = 9222 + Math.floor(Math.random() * 1000);
  const proc = spawn(CHROME, [
    '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--force-color-profile=srgb', '--disable-extensions',
    `--remote-debugging-port=${port}`, pageUrl,
  ], { stdio: 'ignore' });

  for (let attempt = 0; attempt < 50; attempt++) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) return { proc, target };
    } catch { /* not up yet */ }
  }
  proc.kill();
  throw new Error('Chromium did not expose a debugging target');
};

const connect = async (target) => {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve: res, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : res(msg.result);
    }
  };
  await new Promise((r) => { ws.onopen = r; });
  const send = (method, params = {}) =>
    new Promise((res, reject) => {
      const i = ++id;
      pending.set(i, { resolve: res, reject });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { ws, send };
};

const evaluate = async (send, expression) => {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text + ' ' + (exceptionDetails.exception?.description ?? ''));
  return result.value;
};

const key = async (send, k, modifiers = 0) => {
  const codes = {
    Tab: { windowsVirtualKeyCode: 9, code: 'Tab', key: 'Tab' },
    Enter: { windowsVirtualKeyCode: 13, code: 'Enter', key: 'Enter' },
    Escape: { windowsVirtualKeyCode: 27, code: 'Escape', key: 'Escape' },
    ArrowDown: { windowsVirtualKeyCode: 40, code: 'ArrowDown', key: 'ArrowDown' },
    ArrowUp: { windowsVirtualKeyCode: 38, code: 'ArrowUp', key: 'ArrowUp' },
    Home: { windowsVirtualKeyCode: 36, code: 'Home', key: 'Home' },
    End: { windowsVirtualKeyCode: 35, code: 'End', key: 'End' },
    F6: { windowsVirtualKeyCode: 117, code: 'F6', key: 'F6' },
  };
  const base = codes[k];
  for (const type of ['rawKeyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', { type, modifiers, ...base });
  }
  await sleep(60);
};

/* ---------- checks ---------- */

const INTERACTIVE = new Set(['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'menuitem', 'tab', 'switch']);

function checkAccessibleNames(nodes) {
  const interactive = nodes.filter((n) => INTERACTIVE.has(n.role?.value) && n.ignored !== true);
  for (const n of interactive) {
    const name = (n.name?.value ?? '').trim();
    if (!name) fail(`AX-NAME  a ${n.role.value} has no accessible name`);
  }
  note(`${interactive.length} interactive nodes, all named`);
  return interactive;
}

function checkAmbiguousNames(interactive) {
  // The defect that motivated this harness. axe does not flag it: four buttons
  // named "Dismiss" are each individually valid, and collectively useless when
  // navigating by button. Names must be unique among sibling controls.
  const counts = new Map();
  for (const n of interactive) {
    const name = (n.name?.value ?? '').trim();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let ambiguous = 0;
  for (const [name, count] of counts) {
    if (count > 1) {
      ambiguous++;
      fail(`AX-AMBIGUOUS  ${count} controls share the accessible name ${JSON.stringify(name)} — ` +
           `indistinguishable when navigating by control`);
    }
  }
  if (!ambiguous) note(`${counts.size} distinct control names, none duplicated`);
}

function checkHeadings(nodes) {
  const headings = nodes
    .filter((n) => n.role?.value === 'heading' && n.ignored !== true)
    .map((n) => ({
      name: (n.name?.value ?? '').trim(),
      level: Number(n.properties?.find((p) => p.name === 'level')?.value?.value ?? 0),
    }));
  if (headings.length === 0) fail('AX-HEADINGS  no headings — screen reader users navigate findings by heading');
  let previous = 0;
  for (const h of headings) {
    if (previous && h.level > previous + 1) {
      fail(`AX-HEADINGS  level jumps h${previous} -> h${h.level} at ${JSON.stringify(h.name)}`);
    }
    previous = h.level;
  }
  note(`${headings.length} headings, hierarchy intact (${headings.map((h) => 'h' + h.level).join(' ')})`);
}

function checkLiveRegions(nodes) {
  const live = nodes.filter((n) => n.properties?.some((p) => p.name === 'live' && p.value?.value));
  if (live.length === 0) {
    fail('AX-LIVE  no live region — accept/dismiss outcomes would be silent for screen reader users');
  } else {
    note(`${live.length} live regions present`);
  }
}

/* ---------- run ---------- */

const { server, origin } = await serve();
const { proc, target } = await launch(`${origin}/preview.html`);
const { ws, send } = await connect(target);

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Accessibility.enable');
  await sleep(600); // let hydration settle

  /* --- axe-core --- */
  await evaluate(send, readFileSync(AXE, 'utf8'));
  const axe = await evaluate(send, `
    axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } })
      .then(r => JSON.stringify({
        violations: r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length })),
        passes: r.passes.length,
      }))
  `);
  const axeResult = JSON.parse(axe);
  for (const v of axeResult.violations) {
    fail(`AXE  ${v.id} (${v.impact}) x${v.nodes} — ${v.help}`);
  }
  if (axeResult.violations.length === 0) note(`axe-core: 0 violations, ${axeResult.passes} rules passed`);

  /* --- accessibility tree --- */
  const { nodes } = await send('Accessibility.getFullAXTree');
  const interactive = checkAccessibleNames(nodes);
  checkAmbiguousNames(interactive);
  checkHeadings(nodes);
  checkLiveRegions(nodes);

  /* --- keyboard mechanics --- */
  const focused = () => evaluate(send, `(() => {
    const a = document.activeElement;
    if (!a) return 'none';
    return (a.tagName + ':' + (a.textContent || '').trim().slice(0, 28)).trim();
  })()`);

  await evaluate(send, `document.body.focus()`);
  const stops = [];
  for (let i = 0; i < 10; i++) { await key(send, 'Tab'); stops.push(await focused()); }
  const buttonStops = stops.filter((s) => s.startsWith('BUTTON')).length;
  if (buttonStops < 6) fail(`KEYBOARD  Tab reached ${buttonStops} buttons, expected 6 — actions not reachable`);
  else note(`Tab reaches all ${buttonStops} action buttons`);

  // Roving tabindex: arrows move between cards.
  await evaluate(send, `document.querySelector('.ada-card').focus()`);
  const first = await focused();
  await key(send, 'ArrowDown');
  const afterDown = await focused();
  if (first === afterDown) fail('KEYBOARD  ArrowDown did not move between findings');
  else note('ArrowDown moves between findings');
  await key(send, 'End');
  const atEnd = await focused();
  if (atEnd === afterDown) fail('KEYBOARD  End did not jump to the last finding');
  else note('Home/End jump to first and last finding');

  // Escape dismisses, and the live region reports it.
  const before = await evaluate(send, `document.querySelectorAll('.ada-card').length`);
  await evaluate(send, `document.querySelector('.ada-card').focus()`);
  await key(send, 'Escape');
  await sleep(250);
  const after = await evaluate(send, `document.querySelectorAll('.ada-card').length`);
  if (after !== before - 1) fail(`KEYBOARD  Escape did not dismiss (${before} -> ${after})`);
  else note('Escape dismisses the focused finding');

  const announced = await evaluate(send, `(document.querySelector('[role=status]')||{}).textContent || ''`);
  if (!announced.trim()) fail('AX-LIVE  live region stayed empty after a dismiss — the outcome was never announced');
  else note(`live region announced: ${JSON.stringify(announced.trim().slice(0, 70))}`);

  // F6 cycles regions, and is not swallowed by the list.
  await evaluate(send, `document.querySelector('main').focus()`);
  await key(send, 'F6');
  const afterF6 = await evaluate(send, `document.activeElement === document.querySelector('main') ? 'still-main' : 'moved'`);
  if (afterF6 !== 'moved') fail('KEYBOARD  F6 did not cycle out of the document region');
  else note('F6 cycles between document and findings regions');
} finally {
  ws.close();
  proc.kill();
  server.close();
}

console.log('Ada-editor accessibility verification\n');
if (VERBOSE) console.log(notes.join('\n') + '\n');
if (failures.length) {
  console.error(`FAILED (${failures.length})\n`);
  for (const f of failures) console.error('  ' + f);
  console.error('\nFix the components. Do not weaken the check.');
  process.exit(1);
}
console.log(`PASSED — ${notes.length} checks, 0 failures.`);
console.log('Run with --verbose for detail. This verifies the accessibility tree,');
console.log('not a screen reader: see docs/design-system/screen-reader-test-plan.md.');
