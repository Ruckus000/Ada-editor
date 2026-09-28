#!/usr/bin/env node
/**
 * End-to-end test of the account path, against a LOCAL Supabase stack in
 * Docker (supabase/config.toml) — never the hosted project.
 *
 * Every account and sync bug found at launch surfaced only in hand-run live
 * tests; the other gates run in local mode, with no Supabase at all. This
 * builds the app against the local stack and drives Chromium through what a
 * person does: sign up with an emailed code (read from Mailpit), edit, sync,
 * lose the connection, sign out from another tab, export a PDF, send a
 * message, delete the account — asserting both the screen and the database.
 *
 *   node scripts/verify-e2e.mjs [--verbose] [--no-build] [--keep-stack]
 *
 * Needs Docker. Starts the stack if it isn't running (and stops it after,
 * unless --keep-stack); reuses a running one as is.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { CHROME, connect, evaluate, key, launch, openTab, shutdown, sleep, track, watchdog } from './cdp.mjs';
import { ensureVeraPdf, validatePdfUa } from './verapdf.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NEXT = resolve(ROOT, 'node_modules/.bin/next');
const VERBOSE = process.argv.includes('--verbose');
const KEEP = process.argv.includes('--keep-stack');
if (!CHROME) { console.error('No Chromium found. Set CHROME_PATH.'); process.exit(1); }

const failures = [];
const notes = [];
let page = '';
const fail = (m) => failures.push(`[${page}] ${m}`);
const note = (m) => notes.push(`  ok  [${page}] ${m}`);

/* ---------- the local stack ---------- */

// Only what the app uses: Postgres, Auth (gotrue), PostgREST, the Kong gateway, Mailpit.
const EXCLUDE = 'studio,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta';
const supabase = (args, opts = {}) => spawnSync('npx', ['supabase', ...args], { cwd: ROOT, encoding: 'utf8', ...opts });
const stackStatus = () => {
  const out = supabase(['status', '-o', 'json']).stdout ?? '';
  try { return JSON.parse(out.slice(out.indexOf('{'))); } catch { return null; }
};

let stack = stackStatus();
let startedHere = false;
if (!stack?.API_URL) {
  console.log('Starting the local Supabase stack (first run pulls Docker images)…');
  const started = supabase(['start', '-x', EXCLUDE], { stdio: VERBOSE ? 'inherit' : 'pipe' });
  if (started.status !== 0) {
    console.error(`supabase start failed:\n${(started.stderr ?? '') + (started.stdout ?? '')}`);
    process.exit(1);
  }
  startedHere = true;
  stack = stackStatus();
}
const API = stack?.API_URL;
const KEY = stack?.PUBLISHABLE_KEY ?? stack?.ANON_KEY;
const SERVICE = stack?.SERVICE_ROLE_KEY ?? stack?.SECRET_KEY;
const MAIL = stack?.MAILPIT_URL ?? stack?.INBUCKET_URL;
// The one guard that matters most: this test creates and deletes accounts.
if (!API || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(API) || !KEY || !SERVICE || !MAIL) {
  console.error(`Refusing to run: not a local Supabase stack (${JSON.stringify({ API, MAIL })}).`);
  process.exit(1);
}
const stopStack = () => { if (startedHere && !KEEP) supabase(['stop']); };
// The CLI's fixed local-development service key: bypasses RLS, so the test can
// assert what is actually stored.
const db = createClient(API, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

/* ---------- build and serve the app against it ---------- */

const appEnv = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: API,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY,
};
if (!process.argv.includes('--no-build')) {
  const built = spawnSync(NEXT, ['build'], { cwd: ROOT, stdio: VERBOSE ? 'inherit' : 'pipe', env: appEnv });
  if (built.status !== 0) {
    console.error('next build failed\n' + (built.stderr?.toString() ?? '') + (built.stdout?.toString() ?? ''));
    stopStack();
    process.exit(1);
  }
}

const freePort = () => new Promise((res) => {
  const srv = createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => res(port)); });
});
const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const server = track(spawn(NEXT, ['start', '-p', String(port), '-H', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', env: appEnv }));
watchdog(15 * 60_000, stopStack);

let up = false;
for (let i = 0; i < 100 && !up; i++) {
  await sleep(200);
  try { up = (await fetch(origin)).ok; } catch { /* not yet */ }
}
if (!up) { server.kill(); stopStack(); console.error('next start did not come up'); process.exit(1); }

/* ---------- helpers ---------- */

const RUN = Date.now().toString(36);
const address = (who) => `e2e-${RUN}-${who}@example.test`;

// window.confirm answers yes, and remembers what it was asked (sessionStorage,
// so the question survives the navigation that follows a confirmed delete).
const CONFIRM_STUB = `
  window.confirm = (message) => {
    const asked = JSON.parse(sessionStorage.getItem('e2e.confirms') || '[]');
    asked.push(String(message));
    sessionStorage.setItem('e2e.confirms', JSON.stringify(asked));
    return true;
  };`;

/** A fresh browser: its own profile, so it starts signed out with empty storage. */
async function openBrowser() {
  const profile = mkdtempSync(join(tmpdir(), 'ada-e2e-profile-'));
  const { proc, target } = await launch('about:blank', { profileDir: profile });
  const tab = await prepare(target);
  return {
    target,
    tab,
    close: async () => { await shutdown(tab.send, tab.ws, proc); rmSync(profile, { recursive: true, force: true }); },
  };
}

async function prepare(target) {
  const { ws, send } = await connect(target);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: CONFIRM_STUB });
  return { ws, send };
}

const go = (send, path) => send('Page.navigate', { url: origin + path });
/** True once React has attached to the element (props keys on the DOM node). */
const HYDRATED = (selector) => `Object.keys(document.querySelector(${JSON.stringify(selector)}) ?? {}).some((k) => k.startsWith('__reactProps'))`;

/** Poll an expression until it is truthy; its last value otherwise. */
async function waitFor(send, expression, timeout = 15_000) {
  const until = Date.now() + timeout;
  let value;
  do {
    try { value = await evaluate(send, expression); } catch { value = undefined; } // mid-navigation
    if (value) return value;
    await sleep(200);
  } while (Date.now() < until);
  return value;
}

/** Type into the element matched by `selector` the way a person would. */
async function typeInto(send, selector, text) {
  await evaluate(send, `document.querySelector(${JSON.stringify(selector)}).focus()`);
  await send('Input.insertText', { text });
}

const clickButton = (send, name) => evaluate(send, `(() => {
  const b = [...document.querySelectorAll('button')].find((el) => el.textContent.trim().startsWith(${JSON.stringify(name)}));
  if (b) b.click();
  return !!b;
})()`);

/** Put the caret at the very end of the document text and type there. */
async function typeAtEnd(send, text) {
  await evaluate(send, `(() => {
    const el = document.getElementById('document-text');
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  })()`);
  await sleep(100);
  await send('Input.insertText', { text });
}

const saveStatus = (send) => evaluate(send,
  `[...document.querySelectorAll('header span')].map((s) => s.textContent.trim()).find((t) => /^(Saved|Saving…|Not synced)/.test(t)) ?? null`);

/** The newest sign-in email for `email`, from Mailpit: its code, checked against our template. */
async function codeFor(email) {
  for (let i = 0; i < 50; i++) {
    const found = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    const latest = found.messages?.[0];
    if (latest) {
      const message = await (await fetch(`${MAIL}/api/v1/message/${latest.ID}`)).json();
      if (latest.Subject !== 'Your Ada Editor sign-in code') fail(`EMAIL  subject is ${JSON.stringify(latest.Subject)}`);
      if (!message.HTML.includes('Your sign-in code') || !message.HTML.includes(email)) fail('EMAIL  the sign-in email is not supabase/templates/sign-in-code.html');
      const code = message.HTML.match(/>\s*(\d{8})\s*</)?.[1];
      if (!code) fail('EMAIL  no 8-digit code in the email');
      return code;
    }
    await sleep(300);
  }
  fail(`EMAIL  no sign-in email reached ${email}`);
  return null;
}

/** Sign in through the real screen; resolves to the account's user id. */
async function signIn(send, email) {
  await go(send, '/sign-in');
  if (!(await waitFor(send, `!!document.querySelector('input[type=email]')`))) { fail('SIGNIN  no email field'); return null; }
  // Type as soon as the field exists — before React hydrates, as a person on a
  // slow connection would — then check hydration kept it. A controlled field
  // once wiped it silently.
  await typeInto(send, 'input[type=email]', email);
  await waitFor(send, HYDRATED('input[type=email]'));
  const kept = await evaluate(send, `document.querySelector('input[type=email]').value`);
  if (kept !== email) fail(`SIGNIN  hydration wiped the email typed before the page finished loading (left ${JSON.stringify(kept)})`);
  await key(send, 'Enter');
  if (!(await waitFor(send, `!!document.querySelector('input[autocomplete="one-time-code"]')`))) { fail('SIGNIN  never reached the code step'); return null; }
  const code = await codeFor(email);
  if (!code) return null;
  await typeInto(send, 'input[autocomplete="one-time-code"]', code);
  await key(send, 'Enter');
  const landed = await waitFor(send, `location.pathname === '/' && document.querySelectorAll('.dash-rows > li').length`, 20_000);
  if (!landed) { fail(`SIGNIN  did not reach the dashboard (at ${await evaluate(send, 'location.pathname')})`); return null; }
  return evaluate(send, `(() => {
    const k = Object.keys(localStorage).find((n) => /^sb-.*-auth-token$/.test(n));
    return k ? JSON.parse(localStorage.getItem(k)).user.id : null;
  })()`);
}

const docsOf = async (uid) => (await db.from('documents').select('id, content, updated_at, targets').eq('owner_id', uid)).data ?? [];
const docOf = async (uid, id) => (await db.from('documents').select('content, updated_at').eq('owner_id', uid).eq('id', id).single()).data;
const contentHas = (row, text) => JSON.stringify(row?.content ?? {}).includes(text);

/** Wait until the server's copy of a doc satisfies `test`. */
async function waitForRow(uid, id, test, timeout = 15_000) {
  const until = Date.now() + timeout;
  let row;
  do {
    row = await docOf(uid, id);
    if (test(row)) return row;
    await sleep(300);
  } while (Date.now() < until);
  return row;
}

async function downloadPdf(send, dir, docId) {
  await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
  if (!(await clickButton(send, 'Export PDF'))) { fail(`PDF  no Export PDF button on ${docId}`); return null; }
  for (let i = 0; i < 75; i++) {
    const file = readdirSync(dir).find((f) => f === `${docId}.pdf`);
    if (file) return join(dir, file);
    await sleep(200);
  }
  fail(`PDF  ${docId}.pdf was not downloaded`);
  return null;
}

/* ---------- scenarios ---------- */

const A = address('a');
const EDITED = 'transit-notice'; // edited below; not one of the PDF comparisons
let uid = null;

// 1–5 in one browser: sign up, edit, restore, offline, cross-tab sign-out.
async function firstBrowser() {
  const browser = await openBrowser();
  const { send } = browser.tab;
  try {
    page = 'sign up';
    uid = await signIn(send, A);
    if (!uid) return;
    const rows = await docsOf(uid);
    const shown = await evaluate(send, `document.querySelectorAll('.dash-rows > li').length`);
    if (rows.length !== 8 || shown !== 8) fail(`SEED  expected the 8 samples on screen and on the server (screen ${shown}, server ${rows.length})`);
    else note('a new account signs up with an emailed code and gets the 8 samples, on screen and on the server');
    if (rows.some((r) => r.targets.includes('PDF/UA'))) fail('SEED  a sample claims PDF/UA');

    page = 'opening is not editing';
    const before = await docOf(uid, 'water-quality');
    await go(send, '/editor/water-quality');
    await waitFor(send, `!!document.getElementById('document-text')`);
    await sleep(3000); // longer than the push delay
    const after = await docOf(uid, 'water-quality');
    if (after?.updated_at !== before?.updated_at) fail('SYNC  opening a document without editing pushed it (could overwrite newer edits from another device)');
    else note('opening a document without editing pushes nothing');

    page = 'edit syncs';
    await go(send, `/editor/${EDITED}`);
    await waitFor(send, `!!document.getElementById('document-text')`);
    await typeAtEnd(send, ' E2E synced edit.');
    const synced = await waitForRow(uid, EDITED, (r) => contentHas(r, 'E2E synced edit.'));
    const status = await waitFor(send, `[...document.querySelectorAll('header span')].some((s) => s.textContent.trim() === 'Saved')`, 10_000);
    if (!contentHas(synced, 'E2E synced edit.')) fail('SYNC  a typed edit never reached the server');
    else if (!status) fail(`SYNC  the edit reached the server but the status reads ${JSON.stringify(await saveStatus(send))}`);
    else note('a typed edit reaches the server and the status reads Saved');

    page = 'restored from the server';
    await evaluate(send, `Object.keys(localStorage).filter((k) => k.startsWith('ada.docs.v1')).forEach((k) => localStorage.removeItem(k))`);
    await send('Page.reload');
    const restored = await waitFor(send, `document.getElementById('document-text')?.textContent.includes('E2E synced edit.')`, 20_000);
    if (!restored) fail('RESTORE  with the browser copy wiped, the edit did not come back from the server');
    else note('with the browser copy wiped, documents and edits come back from the server');

    page = 'offline';
    await send('Network.enable');
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await typeAtEnd(send, ' E2E offline edit.');
    const unsynced = await waitFor(send, `[...document.querySelectorAll('header span')].some((s) => s.textContent.trim() === 'Not synced — kept in this browser')`, 12_000);
    const told = await waitFor(send, `(document.querySelector('[role=status]')?.textContent ?? '').includes('aren’t reaching your account')`, 5_000);
    const leaked = contentHas(await docOf(uid, EDITED), 'E2E offline edit.');
    if (!unsynced) fail(`OFFLINE  status reads ${JSON.stringify(await saveStatus(send))}, not "Not synced — kept in this browser"`);
    else if (!told) fail('OFFLINE  losing the connection was not announced');
    else if (leaked) fail('OFFLINE  the edit reached the server while offline (emulation not in effect)');
    else note('offline: the edit stays in the browser, the status says so, and it is announced');
    const offlineAt = Date.now();
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const back = await waitForRow(uid, EDITED, (r) => contentHas(r, 'E2E offline edit.'), 40_000);
    const savedAgain = await waitFor(send, `[...document.querySelectorAll('header span')].some((s) => s.textContent.trim() === 'Saved')`, 5_000);
    if (!contentHas(back, 'E2E offline edit.')) fail('OFFLINE  back online, the offline edit never reached the server');
    else if (!savedAgain) fail('OFFLINE  the offline edit synced but the status did not return to Saved');
    else note(`back online, the offline edit syncs and the status returns to Saved (${Date.now() - offlineAt < 10_000 ? 'on the online event' : 'on the 30 s retry'})`);

    page = 'cross-tab sign-out';
    const other = await openTab(browser.target);
    const second = await prepare(other);
    await go(second.send, '/');
    if (!(await waitFor(second.send, `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Sign out')`, 20_000))) {
      fail('TABS  the second tab never showed Sign out');
    } else {
      await clickButton(second.send, 'Sign out');
      const left = await waitFor(send, `location.pathname === '/sign-in'`, 15_000);
      const storage = await evaluate(send, `Object.keys(localStorage)`);
      if (!left) fail(`TABS  signing out in another tab left this tab at ${await evaluate(send, 'location.pathname')}`);
      else if (storage.some((k) => k.startsWith('ada.docs.v1') || /^sb-.*-auth-token$/.test(k))) fail(`TABS  signed out, but the browser still holds ${JSON.stringify(storage)}`);
      else note('signing out in one tab takes the other tab out of the account, and nothing is left in the browser');
    }
    // Close only this tab's socket: Browser.close (shutdown) would end the whole browser.
    second.ws.close();
  } finally {
    await browser.close();
  }
}

// 6–7 in a fresh browser: returning sign-in, PDF export, message, deletion.
async function secondBrowser() {
  const browser = await openBrowser();
  const { send } = browser.tab;
  const dir = mkdtempSync(join(tmpdir(), 'ada-e2e-pdf-'));
  try {
    page = 'returning sign-in';
    const again = await signIn(send, A);
    if (!again) return;
    if (again !== uid) fail('SIGNIN  signing in again created a different account');
    const rows = await docsOf(again);
    if (rows.length !== 8) fail(`SEED  a returning account has ${rows.length} documents; samples were seeded again or lost`);
    else note('signing in again reaches the same account, with nothing seeded twice');
    if (!contentHas(rows.find((r) => r.id === EDITED), 'E2E offline edit.')) fail('SYNC  the other browser’s edits are missing in a fresh one');

    page = 'export PDF';
    await go(send, '/');
    await waitFor(send, `document.querySelectorAll('.dash-rows > li').length`);
    await clickButton(send, 'New document');
    await waitFor(send, `document.activeElement?.closest('[role=dialog]') && document.activeElement.tagName === 'INPUT'`);
    await send('Input.insertText', { text: 'E2E clean document' });
    await key(send, 'Enter');
    if (!(await waitFor(send, `location.pathname === '/editor/e2e-clean-document' && !!document.getElementById('document-text')`))) {
      fail('PDF  New document did not open the document');
    } else {
      await typeAtEnd(send, 'This document has one heading and one paragraph.');
      await sleep(700); // the editor's local save debounce
      const clean = await downloadPdf(send, dir, 'e2e-clean-document');
      await go(send, '/editor/hearing-notice');
      await waitFor(send, `!!document.getElementById('document-text')`);
      const flagged = await downloadPdf(send, dir, 'hearing-notice');
      if (clean && flagged) {
        const vera = ensureVeraPdf({ verbose: VERBOSE });
        if (!vera.ok) {
          if (process.env.CI) fail(`PDF  veraPDF could not run: ${vera.why}. CI is where this must run, so a skip here is a failure.`);
          else console.log(`  SKIPPED veraPDF — ${vera.why}. The PDFs downloaded; install Java 11+ and Maven to validate them here.`);
        } else {
          const { results, error } = validatePdfUa([clean, flagged]);
          if (error) fail(`PDF  ${error}`);
          const want = new Map([[clean, []], [flagged, ['7.3-1', '7.4.2-1']]]);
          for (const [file, expected] of want) {
            const got = results.get(file)?.failed;
            if (JSON.stringify(got) !== JSON.stringify(expected)) fail(`PDF  ${file.split('/').pop()} failed ${JSON.stringify(got)}; expected ${JSON.stringify(expected)}`);
          }
          if (!failures.some((f) => f.includes('PDF  '))) note('a signed-in export is PDF/UA-1: a clean document passes, and hearing-notice fails on exactly 7.3-1 and 7.4.2-1');
        }
      }
    }

    page = 'privacy';
    await go(send, '/privacy');
    if (!(await waitFor(send, `!!document.querySelector('textarea')`))) { fail('PRIVACY  no message form for a signed-in account'); return; }
    await typeInto(send, 'textarea', 'E2E message: please ignore.');
    await clickButton(send, 'Send message');
    const sent = await waitFor(send, `document.querySelector('.privacy__ok')?.textContent`);
    const messages = (await db.from('contact_messages').select('email, message').eq('user_id', uid)).data ?? [];
    if (!sent) fail('PRIVACY  sending a message showed no confirmation');
    else if (messages.length !== 1 || messages[0].email !== A) fail(`PRIVACY  expected one message from ${A}, found ${JSON.stringify(messages)}`);
    else note('a message is stored once, from the signed-in address');

    await clickButton(send, 'Delete my account');
    const deleted = await waitFor(send, `location.pathname === '/sign-in' && location.search.includes('deleted') && document.querySelector('.signin__notice')?.textContent`, 20_000);
    const asked = JSON.parse(await evaluate(send, `sessionStorage.getItem('e2e.confirms') || '[]'`));
    const { data: user } = await db.auth.admin.getUserById(uid);
    const leftDocs = (await docsOf(uid)).length;
    const leftMessages = ((await db.from('contact_messages').select('id').eq('user_id', uid)).data ?? []).length
      + ((await db.from('contact_messages').select('id').eq('email', A)).data ?? []).length;
    if (!asked.some((q) => q.includes('can’t be undone'))) fail(`DELETE  deletion was not confirmed first (asked ${JSON.stringify(asked)})`);
    else if (!deleted) fail('DELETE  did not land on sign-in with the deleted notice');
    else if (user?.user || leftDocs || leftMessages) fail(`DELETE  left behind: user ${!!user?.user}, ${leftDocs} documents, ${leftMessages} messages`);
    else note('deleting the account asks first, then removes the user, its documents and its messages');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await browser.close();
  }
}

// 8: the database rules, in the stack's own Postgres.
function rlsTest() {
  page = 'database rules';
  const sql = readFileSync(join(ROOT, 'supabase/tests/rls.sql'), 'utf8');
  const run = spawnSync('docker', ['exec', '-i', 'supabase_db_ada-editor', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA'], { input: sql, encoding: 'utf8' });
  if (run.status !== 0 || !run.stdout.includes('rls ok')) fail(`RLS  supabase/tests/rls.sql failed: ${(run.stderr || run.stdout).trim().split('\n').slice(-3).join(' ')}`);
  else note('supabase/tests/rls.sql: rls ok');
}

try {
  await firstBrowser();
  if (uid) await secondBrowser();
  rlsTest();
} finally {
  server.kill();
  stopStack();
}

console.log('Ada-editor end-to-end (local Supabase)\n');
if (VERBOSE) console.log(notes.join('\n') + '\n');
if (failures.length) {
  console.error(`FAILED (${failures.length})\n`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`PASSED — ${notes.length} checks, 0 failures.`);
