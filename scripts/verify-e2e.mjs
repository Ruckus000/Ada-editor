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
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { CHROME, connect, evaluate, key, launch, openTab, shutdown, sleep, track, watchdog } from './cdp.mjs';
import { ensureVeraPdf, validatePdfUa } from './verapdf.mjs';
import { png } from './harness/images.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PICTURE = png(64, 48);
const PICTURE_KEY = createHash('sha256').update(PICTURE).digest('hex');
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
// storage-api runs: documents' images live in its bucket. imgproxy (image
// transforms) isn't used.
const EXCLUDE = 'studio,realtime,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta';
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
// Always bring the database up to the latest migrations: a running stack may
// predate them, and even a fresh `supabase start` restores the volume a
// previous `supabase stop` kept — without applying anything new. Either way the
// test would check today's code against yesterday's database.
if (stack?.API_URL) {
  const migrated = supabase(['migration', 'up', '--local']);
  if (migrated.status !== 0) {
    console.error(`supabase migration up failed:\n${(migrated.stderr ?? '') + (migrated.stdout ?? '')}`);
    process.exit(1);
  }
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

/** Remove a temp dir. Chrome can still be flushing its profile as it exits
 *  (ENOTEMPTY in CI), so retry — and never let cleanup fail the test. */
const tidy = (dir) => {
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* the OS cleans tmp */ }
};

/** A fresh browser: its own profile, so it starts signed out with empty storage. */
async function openBrowser() {
  const profile = mkdtempSync(join(tmpdir(), 'ada-e2e-profile-'));
  const { proc, target } = await launch('about:blank', { profileDir: profile });
  const tab = await prepare(target);
  return {
    target,
    tab,
    close: async () => { await shutdown(tab.send, tab.ws, proc); tidy(profile); },
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
  // Signed in = the desk homepage rendered its documents (or its empty desk).
  const landed = await waitFor(send, `location.pathname === '/' && !!document.querySelector('.home-main') && !!(document.querySelector('.home-sheet') || document.querySelector('.home-how'))`, 20_000);
  if (!landed) { fail(`SIGNIN  did not reach the dashboard (at ${await evaluate(send, 'location.pathname')})`); return null; }
  return evaluate(send, `(() => {
    const k = Object.keys(localStorage).find((n) => /^sb-.*-auth-token$/.test(n));
    return k ? JSON.parse(localStorage.getItem(k)).user.id : null;
  })()`);
}

// Asked directly (a download), not through a listing's search.
const objectExists = async (uid, key) => !(await db.storage.from('images').download(`${uid}/${key}`)).error;
async function waitForObject(uid, key, timeout = 15_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await objectExists(uid, key)) return true;
    await sleep(300);
  }
  return false;
}
const docsOf = async (uid) => (await db.from('documents').select('id, content, updated_at, targets').eq('owner_id', uid)).data ?? [];
const docOf = async (uid, id) => (await db.from('documents').select('content, updated_at, header_image').eq('owner_id', uid).eq('id', id).single()).data;
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
const SAMPLE = 'hearing-notice'; // the one sample a new account gets (store.ts SAMPLE_ID)
const SYNCED = 'e2e-sync-document';
const CLEAN = 'e2e-clean-document';
let uid = null;

/** Documents on the homepage: sheet links (not "Your call" notes). */
const sheetIds = (send) => evaluate(send,
  `[...document.querySelectorAll('a.home-sheet')].map((a) => a.getAttribute('href').replace('/editor/', ''))`);

async function goHome(send) {
  await go(send, '/');
  return waitFor(send, `!!document.querySelector('.home-main') && !!(document.querySelector('.home-sheet') || document.querySelector('.home-how'))`, 20_000);
}

/** + (New document) → Create a document → title → the new document's editor. */
async function createDocument(send, title, id) {
  if (!(await clickButton(send, 'New document'))) { fail('NEWDOC  no + (New document) button'); return false; }
  await sleep(200);
  if (!(await clickButton(send, 'Create a document'))) { fail('NEWDOC  the + menu has no Create a document'); return false; }
  await waitFor(send, `document.activeElement?.closest('[role=dialog]') && document.activeElement.tagName === 'INPUT'`);
  await send('Input.insertText', { text: title });
  await key(send, 'Enter');
  if (!(await waitFor(send, `location.pathname === '/editor/${id}' && !!document.getElementById('document-text')`))) {
    fail(`NEWDOC  creating "${title}" did not open /editor/${id}`);
    return false;
  }
  return true;
}

/** Delete from the editor; checks it asked, where it lands, and what it says. */
async function deleteFromEditor(send, id, title) {
  await go(send, `/editor/${id}`);
  await waitFor(send, `!!document.getElementById('document-text')`);
  await evaluate(send, `sessionStorage.removeItem('e2e.confirms')`);
  if (!(await clickButton(send, 'Delete document'))) { fail(`DELETE  no Delete document button on ${id}`); return false; }
  const home = await waitFor(send, `location.pathname === '/' && !!document.querySelector('.home-main')`, 15_000);
  const said = await waitFor(send, `(document.querySelector('[role=status]')?.textContent ?? '').startsWith('Deleted ${title}')`, 5_000);
  const asked = JSON.parse(await evaluate(send, `sessionStorage.getItem('e2e.confirms') || '[]'`));
  if (!asked.some((q) => q.includes('can’t be undone'))) { fail(`DELETE  deleting ${id} did not ask first (asked ${JSON.stringify(asked)})`); return false; }
  if (!home || !said) { fail(`DELETE  deleting ${id} did not return home announcing "Deleted ${title}."`); return false; }
  return true;
}

// Browser 1, a new account: sign up, edit, restore, offline, cross-tab sign-out.
async function firstBrowser() {
  const browser = await openBrowser();
  const { send } = browser.tab;
  try {
    page = 'sign up';
    uid = await signIn(send, A);
    if (!uid) return;
    const onDesk = await sheetIds(send);
    const sampleOnly = await evaluate(send, `!!document.querySelector('.home-how')`);
    const rows = await docsOf(uid);
    if (!sampleOnly || JSON.stringify(onDesk) !== JSON.stringify([SAMPLE])) fail(`SEED  a new account should see only the sample on an empty desk (layout ${sampleOnly ? 'sample-only' : 'other'}, sheets ${JSON.stringify(onDesk)})`);
    else if (rows.length !== 1 || rows[0].id !== SAMPLE) fail(`SEED  the server should hold just the sample (has ${JSON.stringify(rows.map((r) => r.id))})`);
    else note('a new account signs up with an emailed code and gets the one sample, on screen and on the server');
    if (rows.some((r) => r.targets.includes('PDF/UA'))) fail('SEED  the sample claims PDF/UA');
    let seeded = false;
    for (let i = 0; i < 25 && !seeded; i++) {
      seeded = Boolean((await db.auth.admin.getUserById(uid)).data?.user?.user_metadata?.sample_seeded);
      if (!seeded) await sleep(200);
    }
    if (!seeded) fail('SEED  the account was not marked sample_seeded, so removing the sample could bring it back');

    page = 'opening is not editing';
    const before = await docOf(uid, SAMPLE);
    await go(send, `/editor/${SAMPLE}`);
    await waitFor(send, `!!document.getElementById('document-text')`);
    await sleep(3000); // longer than the push delay
    const after = await docOf(uid, SAMPLE);
    if (after?.updated_at !== before?.updated_at) fail('SYNC  opening a document without editing pushed it (could overwrite newer edits from another device)');
    else note('opening a document without editing pushes nothing');

    page = 'edit syncs';
    await goHome(send);
    if (!(await createDocument(send, 'E2E sync document', SYNCED))) return;
    await typeAtEnd(send, 'E2E synced edit.');
    const synced = await waitForRow(uid, SYNCED, (r) => contentHas(r, 'E2E synced edit.'));
    const status = await waitFor(send, `[...document.querySelectorAll('header span')].some((s) => s.textContent.trim() === 'Saved')`, 10_000);
    if (!contentHas(synced, 'E2E synced edit.')) fail('SYNC  a new document’s typed text never reached the server');
    else if (!status) fail(`SYNC  the edit reached the server but the status reads ${JSON.stringify(await saveStatus(send))}`);
    else note('a document made from the + menu, and what is typed in it, reach the server; the status reads Saved');

    page = 'images';
    const pictureDir = mkdtempSync(join(tmpdir(), 'ada-e2e-image-'));
    const pictureFile = join(pictureDir, 'e2e-picture.png');
    writeFileSync(pictureFile, PICTURE);
    const { result: input } = await send('Runtime.evaluate', { expression: `document.querySelector('input[type=file][aria-label="Choose an image"]')` });
    if (!input.objectId) fail('IMAGE  the editor has no image file input');
    else {
      await typeAtEnd(send, ' ');
      await send('DOM.setFileInputFiles', { objectId: input.objectId, files: [pictureFile] });
      const stored = await waitForObject(uid, PICTURE_KEY);
      const row = await waitForRow(uid, SYNCED, (r) => contentHas(r, PICTURE_KEY));
      const keys = (await db.from('documents').select('image_keys').eq('id', SYNCED).eq('owner_id', uid).single()).data?.image_keys ?? [];
      if (!stored) fail(`IMAGE  the inserted picture never reached the account's bucket at ${uid}/${PICTURE_KEY}`);
      else if (!contentHas(row, PICTURE_KEY) || !keys.includes(PICTURE_KEY)) fail(`IMAGE  the document row does not refer to its picture (image_keys ${JSON.stringify(keys)})`);
      else note('an inserted picture uploads to the private bucket under the account, and the row names it');
      // The same picture as the header logo: saved in the row's header_image.
      await evaluate(send, `document.querySelector('[role=toolbar] button[aria-label="Edit header and footer"]')?.click()`);
      await waitFor(send, `[...document.querySelectorAll('[role=dialog] button')].some((b) => b.textContent.includes('Insert logo or image in header'))`, 5_000);
      await clickButton(send, 'Insert logo or image in header');
      await sleep(200);
      const { result: again } = await send('Runtime.evaluate', { expression: `document.querySelector('input[type=file][aria-label="Choose an image"]')` });
      await send('DOM.setFileInputFiles', { objectId: again.objectId, files: [pictureFile] });
      const withLogo = await waitForRow(uid, SYNCED, (r) => r?.header_image?.image === PICTURE_KEY);
      if (withLogo?.header_image?.image !== PICTURE_KEY) fail(`IMAGE  the header logo never reached the row's header_image (${JSON.stringify(withLogo?.header_image)})`);
      else note('a header logo is saved with the document in the account (header_image)');
      await key(send, 'Escape');
    }
    tidy(pictureDir);

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
    const leaked = contentHas(await docOf(uid, SYNCED), 'E2E offline edit.');
    if (!unsynced) fail(`OFFLINE  status reads ${JSON.stringify(await saveStatus(send))}, not "Not synced — kept in this browser"`);
    else if (!told) fail('OFFLINE  losing the connection was not announced');
    else if (leaked) fail('OFFLINE  the edit reached the server while offline (emulation not in effect)');
    else note('offline: the edit stays in the browser, the status says so, and it is announced');
    const offlineAt = Date.now();
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const back = await waitForRow(uid, SYNCED, (r) => contentHas(r, 'E2E offline edit.'), 40_000);
    const savedAgain = await waitFor(send, `[...document.querySelectorAll('header span')].some((s) => s.textContent.trim() === 'Saved')`, 5_000);
    if (!contentHas(back, 'E2E offline edit.')) fail('OFFLINE  back online, the offline edit never reached the server');
    else if (!savedAgain) fail('OFFLINE  the offline edit synced but the status did not return to Saved');
    else note(`back online, the offline edit syncs and the status returns to Saved (${Date.now() - offlineAt < 10_000 ? 'on the online event' : 'on the 30 s retry'})`);

    page = 'cross-tab sign-out';
    const other = await openTab(browser.target);
    const second = await prepare(other);
    await goHome(second.send);
    await clickButton(second.send, 'Account');
    if (!(await waitFor(second.send, `[...document.querySelectorAll('.home-pop__panel button')].some((b) => b.textContent.trim() === 'Sign out')`, 5_000))) {
      fail('TABS  the Account menu has no Sign out');
    } else {
      await clickButton(second.send, 'Sign out');
      const left = await waitFor(send, `location.pathname === '/sign-in'`, 15_000);
      const storage = await evaluate(send, `Object.keys(localStorage)`);
      if (!left) fail(`TABS  signing out in another tab left this tab at ${await evaluate(send, 'location.pathname')}`);
      else if (storage.some((k) => k.startsWith('ada.docs.v1') || /^sb-.*-auth-token$/.test(k))) fail(`TABS  signed out, but the browser still holds ${JSON.stringify(storage)}`);
      else note('Sign out (Account menu) in one tab takes the other tab out of the account, and nothing is left in the browser');
      const keptImages = await evaluate(send, `new Promise((done) => { const r = indexedDB.open('ada-images'); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('blobs')) { done(0); return; } const q = db.transaction('blobs').objectStore('blobs').index('scope').count(${JSON.stringify(uid)}); q.onsuccess = () => done(q.result); q.onerror = () => done(-1); }; r.onerror = () => done(-1); })`);
      if (keptImages !== 0) fail(`TABS  signed out, but ${keptImages} of the account's images are still in this browser`);
      else note('signing out also forgets the account’s images in this browser');
    }
    // Close only this tab's socket: Browser.close (shutdown) would end the whole browser.
    second.ws.close();
  } finally {
    await browser.close();
  }
}

// Browser 2, the same account returning: PDF export, deletion, the sample,
// the message form, account deletion.
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
    const onDesk = (await sheetIds(send)).sort();
    const want = [SYNCED, SAMPLE].sort();
    if (JSON.stringify(rows.map((r) => r.id).sort()) !== JSON.stringify(want) || JSON.stringify(onDesk) !== JSON.stringify(want)) {
      fail(`SEED  a returning account should have ${JSON.stringify(want)} (server ${JSON.stringify(rows.map((r) => r.id))}, desk ${JSON.stringify(onDesk)})`);
    } else note('signing in again reaches the same account, both documents on the desk, nothing seeded twice');
    if (!contentHas(rows.find((r) => r.id === SYNCED), 'E2E offline edit.')) fail('SYNC  the other browser’s edits are missing in a fresh one');

    page = 'images on another device';
    await go(send, `/editor/${SYNCED}`);
    const drawn = await waitFor(send, `(document.querySelector('#document-text [role=img] img')?.naturalWidth ?? 0) === 64`, 20_000);
    if (!drawn) fail('IMAGE  a fresh browser did not download and show the picture from the account');
    else note('a fresh browser downloads the picture from the account’s bucket and shows it');

    page = 'image sweep';
    // Edited out of every document and over a week old: the sweep removes it.
    // Unused but new (another device mid-save), or old but in use: both stay.
    const [oldStray, newStray] = ['a'.repeat(64), 'b'.repeat(64)];
    for (const key of [oldStray, newStray]) {
      const { error } = await db.storage.from('images').upload(`${uid}/${key}`, PICTURE, { contentType: 'image/png' });
      if (error) fail(`SWEEP  could not stage ${key.slice(0, 4)}…: ${error.message}`);
    }
    psql(`update storage.objects set created_at = now() - interval '8 days' where bucket_id = 'images' and name in ('${uid}/${oldStray}', '${uid}/${PICTURE_KEY}');`);
    await evaluate(send, `localStorage.removeItem('ada.images.swept.${uid}')`);
    await send('Page.reload');
    let swept = false;
    for (let i = 0; i < 40 && !swept; i++) {
      swept = !(await objectExists(uid, oldStray));
      if (!swept) await sleep(300);
    }
    if (!swept) fail('SWEEP  an old image no document uses is still in the bucket after sign-in');
    else if (!(await objectExists(uid, newStray))) fail('SWEEP  an unused image uploaded moments ago was removed (another device may be about to save it)');
    else if (!(await objectExists(uid, PICTURE_KEY))) fail('SWEEP  removed an old image a document still uses');
    else if (!(await evaluate(send, `!!localStorage.getItem('ada.images.swept.${uid}')`))) fail('SWEEP  the sweep did not record itself, so it would run on every page load');
    else note('the sweep removes an old image no document uses, and keeps a new one and one in use');
    await db.storage.from('images').remove([`${uid}/${newStray}`]);
    await goHome(send);

    page = 'export PDF';
    if (await createDocument(send, 'E2E clean document', CLEAN)) {
      await typeAtEnd(send, 'This document has one heading and one paragraph.');
      await sleep(700); // the editor's local save debounce
      const clean = await downloadPdf(send, dir, CLEAN);
      await go(send, `/editor/${SAMPLE}`);
      await waitFor(send, `!!document.getElementById('document-text')`);
      const flagged = await downloadPdf(send, dir, SAMPLE);
      if (clean && flagged) {
        const vera = ensureVeraPdf({ verbose: VERBOSE });
        if (!vera.ok) {
          if (process.env.CI) fail(`PDF  veraPDF could not run: ${vera.why}. CI is where this must run, so a skip here is a failure.`);
          else console.log(`  SKIPPED veraPDF — ${vera.why}. The PDFs downloaded; install Java 11+ and Maven to validate them here.`);
        } else {
          const { results, error } = validatePdfUa([clean, flagged]);
          if (error) fail(`PDF  ${error}`);
          const expected = new Map([[clean, []], [flagged, ['7.3-1', '7.4.2-1']]]);
          for (const [file, clauses] of expected) {
            const got = results.get(file)?.failed;
            if (JSON.stringify(got) !== JSON.stringify(clauses)) fail(`PDF  ${file.split('/').pop()} failed ${JSON.stringify(got)}; expected ${JSON.stringify(clauses)}`);
          }
          if (!failures.some((f) => f.includes('PDF  '))) note(`a signed-in export is PDF/UA-1: a clean document passes, and ${SAMPLE} fails on exactly 7.3-1 and 7.4.2-1`);
        }
      }
    }

    page = 'delete documents';
    let deletedBoth = true;
    for (const [id, title] of [[CLEAN, 'E2E clean document'], [SYNCED, 'E2E sync document']]) {
      if (!(await deleteFromEditor(send, id, title))) { deletedBoth = false; continue; }
      const row = await docOf(uid, id);
      if (row) { fail(`DELETE  ${id} is still on the server`); deletedBoth = false; }
    }
    await send('Page.reload');
    await waitFor(send, `!!document.querySelector('.home-main') && !!(document.querySelector('.home-sheet') || document.querySelector('.home-how'))`, 20_000);
    await sleep(2500); // a push, had anything been queued, would land by now
    const resurrected = (await docsOf(uid)).map((r) => r.id).filter((id) => id === CLEAN || id === SYNCED);
    if (resurrected.length) fail(`DELETE  deleted documents came back through sync: ${JSON.stringify(resurrected)}`);
    else if (deletedBoth) note('deleting from the editor asks first, announces it, and the documents stay gone after a reload');
    // The picture was only in the deleted document: it goes too.
    let pictureGone = false;
    for (let i = 0; i < 30 && !pictureGone; i++) {
      pictureGone = !(await objectExists(uid, PICTURE_KEY));
      if (!pictureGone) await sleep(300);
    }
    if (!pictureGone) fail('IMAGE  deleting the only document that used a picture left it in the bucket');
    else note('deleting the only document that used a picture removes it from the bucket');

    page = 'remove the sample';
    await goHome(send);
    const emptyDesk = await evaluate(send, `!!document.querySelector('.home-how')`);
    await evaluate(send, `sessionStorage.removeItem('e2e.confirms')`);
    if (!emptyDesk || !(await clickButton(send, 'Remove the sample'))) {
      fail('SAMPLE  with only the sample left, the empty desk has no Remove the sample');
    } else {
      const gone = await waitFor(send, `document.querySelectorAll('.home-sheet').length === 0 && document.activeElement?.id === 'how-heading'`, 10_000);
      const asked = JSON.parse(await evaluate(send, `sessionStorage.getItem('e2e.confirms') || '[]'`));
      const serverRows = (await docsOf(uid)).length;
      await send('Page.reload');
      await waitFor(send, `!!document.querySelector('.home-how')`, 20_000);
      await sleep(2500);
      const afterReload = { screen: (await sheetIds(send)).length, server: (await docsOf(uid)).length };
      if (!asked.some((q) => q.includes('can’t be undone'))) fail(`SAMPLE  removing the sample did not ask first (asked ${JSON.stringify(asked)})`);
      else if (!gone || serverRows !== 0) fail(`SAMPLE  removing the sample left ${serverRows} rows, or focus did not reach the heading`);
      else if (afterReload.screen || afterReload.server) fail(`SAMPLE  the sample came back after a reload (${JSON.stringify(afterReload)})`);
      else note('Remove the sample asks first, empties the desk, and the sample does not come back after a reload');
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

    // An image nothing refers to any more (edited out): account deletion must still remove it.
    const stray = 'e'.repeat(64);
    const { error: strayError } = await db.storage.from('images').upload(`${uid}/${stray}`, PICTURE, { contentType: 'image/png' });
    if (strayError) fail(`IMAGE  could not stage a stray image: ${strayError.message}`);
    await evaluate(send, `sessionStorage.removeItem('e2e.confirms')`);
    await clickButton(send, 'Delete my account');
    const deleted = await waitFor(send, `location.pathname === '/sign-in' && location.search.includes('deleted') && document.querySelector('.signin__notice')?.textContent`, 20_000);
    const asked = JSON.parse(await evaluate(send, `sessionStorage.getItem('e2e.confirms') || '[]'`));
    const { data: user } = await db.auth.admin.getUserById(uid);
    const leftDocs = (await docsOf(uid)).length;
    const leftMessages = ((await db.from('contact_messages').select('id').eq('user_id', uid)).data ?? []).length
      + ((await db.from('contact_messages').select('id').eq('email', A)).data ?? []).length;
    if (!asked.some((q) => q.includes('can’t be undone'))) fail(`ACCOUNT  deleting the account was not confirmed first (asked ${JSON.stringify(asked)})`);
    else if (!deleted) fail('ACCOUNT  did not land on sign-in with the deleted notice');
    else if (user?.user || leftDocs || leftMessages) fail(`ACCOUNT  left behind: user ${!!user?.user}, ${leftDocs} documents, ${leftMessages} messages`);
    else note('deleting the account asks first, then removes the user, its documents and its messages');
    const leftImages = ((await db.storage.from('images').list(uid)).data ?? []).length;
    if (leftImages || (await objectExists(uid, stray))) fail(`ACCOUNT  images were left in the deleted account's folder (${leftImages} listed)`);
    else note('deleting the account empties its image folder');
  } finally {
    tidy(dir);
    await browser.close();
  }
}

/** SQL as postgres in the stack's own database; throws if it fails. */
function psql(sql) {
  const run = spawnSync('docker', ['exec', '-i', 'supabase_db_ada-editor', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA'], { input: sql, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`psql failed: ${(run.stderr || run.stdout).trim()}`);
  return run.stdout;
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
  // A crash is a failure like any other: report it with everything that ran.
  const run = async (fn) => { try { await fn(); } catch (error) { fail(`CRASH  ${error?.stack ?? error}`); } };
  await run(firstBrowser);
  if (uid) await run(secondBrowser);
  await run(rlsTest);
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
