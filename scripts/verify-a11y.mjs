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

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { serve } from './serve-preview.mjs';
import { CHROME, connect, evaluate, key, launch, shutdown, sleep, watchdog } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
if (!CHROME) { console.error('No Chromium found. Set CHROME_PATH.'); process.exit(1); }
const AXE = resolve(HERE, '../node_modules/axe-core/axe.min.js');
const VERBOSE = process.argv.includes('--verbose');

// A hung browser must fail the gate, not stall it forever. The preview server
// is in-process, so exiting stops it; the watchdog kills Chrome.
watchdog(8 * 60_000);

const failures = [];
const notes = [];
const fail = (m) => failures.push(m);
const note = (m) => notes.push('  ok  ' + m);

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

  /**
   * Focus must survive removing the focused finding.
   *
   * This check exists because running Orca found that it did not: focus fell to
   * <body>, the screen reader announced the document instead of the outcome, and
   * the user lost their place. The live region was correct throughout, which is
   * why checking the announcement text alone was not enough.
   *
   * It must activate a BUTTON INSIDE the card, not press Escape on the card
   * itself. Removing a card whose own <li> holds focus can leave focus on a
   * reused node by luck of reconciliation; removing the card that contains the
   * focused button is what actually destroys it. The first version of this
   * check tested the easy path and passed with the fix reverted.
   */
  await evaluate(send, `(() => {
    const card = document.querySelector('.ada-card');
    card.dataset.gateMarked = 'removing';
    // Target a button that actually REMOVES the finding. Since the rule-set
    // spike, the first button in a card is "Go to text", which deliberately
    // leaves the card in place — selecting blind would test nothing.
    const remover = [...card.querySelectorAll('button')]
      .find((b) => /apply fix|dismiss/i.test(b.textContent ?? ''));
    remover.focus();
  })()`);
  const focusedButton = await focused();
  if (!focusedButton.startsWith('BUTTON')) fail(`KEYBOARD  could not focus a finding's button (got ${focusedButton})`);
  const cardsBefore = await evaluate(send, `document.querySelectorAll('.ada-card').length`);
  await key(send, 'Enter');
  await sleep(300);
  const cardsNow = await evaluate(send, `document.querySelectorAll('.ada-card').length`);
  if (cardsNow !== cardsBefore - 1) fail(`KEYBOARD  activating a finding's button did not remove it (${cardsBefore} -> ${cardsNow})`);

  const focusAfter = await evaluate(send, `(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return 'BODY';
    const card = a.closest('.ada-card');
    if (card) return card.dataset.gateMarked === 'removing' ? 'STALE-CARD' : 'card';
    return a.closest('.ada-issues') ? 'findings-region' : a.tagName;
  })()`);
  if (focusAfter === 'BODY' || focusAfter === 'STALE-CARD') {
    fail(`KEYBOARD  focus landed on ${focusAfter} after activating a finding's button — ` +
         'the user loses their place and the announcement is preempted');
  } else {
    note(`focus survives removal (landed on: ${focusAfter})`);
  }

  /**
   * Forced colours: the real test of principle 1.
   *
   * Emulated through CDP so the actual `forced-colors: active` media query
   * evaluates — an earlier version of this test hand-edited the stylesheet,
   * which proved only that the CSS parsed. Under forced colours every severity
   * collapses to the same system colour, so if anything still depends on hue
   * the interface breaks here and nowhere else.
   */
  // Reload first: the keyboard tests above dismissed findings, and this check is
  // worthless unless every severity is present. An earlier run silently
  // compared two underlines instead of four.
  await send('Page.reload', { ignoreCache: false });
  await sleep(900);
  await evaluate(send, readFileSync(AXE, 'utf8'));

  const severitiesPresent = await evaluate(send, `document.querySelectorAll('.ada-underline').length`);
  if (severitiesPresent < 4) {
    fail(`FORCED-COLORS  only ${severitiesPresent} severities on the page; the check needs all 4`);
  }

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
  await sleep(200);

  const forced = await evaluate(send, `matchMedia('(forced-colors: active)').matches`);
  if (!forced) fail('FORCED-COLORS  emulation did not take effect; the check proves nothing');

  const severityColours = await evaluate(send, `(() => {
    const root = getComputedStyle(document.documentElement);
    return ['blocker','violation','advisory','manual']
      .map(s => root.getPropertyValue('--ada-severity-' + s + '-fg').trim());
  })()`);
  const distinctColours = new Set(severityColours);
  if (distinctColours.size > 1) {
    note(`forced-colors: severities keep ${distinctColours.size} distinct colours (${[...distinctColours].join(', ')})`);
  } else {
    note(`forced-colors: all severities collapse to ${[...distinctColours][0]} — colour carries nothing`);
  }

  const underlineStyles = await evaluate(send, `(() => {
    const out = {};
    for (const el of document.querySelectorAll('.ada-underline')) {
      out[el.dataset.severity] = getComputedStyle(el).textDecorationStyle;
    }
    return out;
  })()`);
  const shapes = Object.values(underlineStyles);
  const distinctShapes = new Set(shapes);
  if (distinctShapes.size !== shapes.length) {
    fail(`FORCED-COLORS  underline shapes are not distinct under forced colours ` +
         `(${JSON.stringify(underlineStyles)}) — with colour gone, nothing distinguishes severities`);
  } else {
    note(`forced-colors: ${shapes.length} severities keep distinct underline shapes (${shapes.join(', ')})`);
  }

  // axe again, under forced colours: contrast rules behave differently here.
  // Both schemes, explicitly: the dark theme block once outranked the
  // forced-colors block, and a light-scheme CI runner could never see it.
  for (const scheme of ['light', 'dark']) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }, { name: 'prefers-color-scheme', value: scheme }] });
    await sleep(200);
    const axeForced = JSON.parse(await evaluate(send, `
      axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } })
        .then(r => JSON.stringify({ violations: r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })) }))
    `));
    for (const v of axeForced.violations) fail(`AXE(forced-colors, ${scheme})  ${v.id} (${v.impact}) x${v.nodes}`);
    if (axeForced.violations.length === 0) note(`forced-colors (${scheme} scheme): axe-core reports 0 violations`);
  }

  await send('Emulation.setEmulatedMedia', { features: [] });
  await sleep(150);

  // F6 cycles regions, and is not swallowed by the list.
  await evaluate(send, `document.querySelector('main').focus()`);
  await key(send, 'F6');
  const afterF6 = await evaluate(send, `document.activeElement === document.querySelector('main') ? 'still-main' : 'moved'`);
  if (afterF6 !== 'moved') fail('KEYBOARD  F6 did not cycle out of the document region');
  else note('F6 cycles between document and findings regions');
} finally {
  await shutdown(send, ws, proc);
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
