/**
 * Chromium DevTools Protocol plumbing shared by the accessibility gates.
 *
 * No Playwright, no webdriver: CDP is built into the browser, and
 * `Accessibility.getFullAXTree` returns exactly what the browser hands
 * assistive technology.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { findChrome } from './find-chrome.mjs';

export const CHROME = findChrome();

// Node 20 has no global WebSocket, and CDP needs one. Fail with a sentence
// rather than a bare ReferenceError three frames deep.
if (typeof WebSocket === 'undefined') {
  console.error(`This gate needs Node 22 or newer for the global WebSocket (running ${process.version}).`);
  process.exit(1);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every Chrome still running, so a watchdog exit can take them down too.
const running = new Set();

// Safety net for every process-exit path — normal end, uncaught exception,
// explicit exit: an orphaned gate browser holds ports and burns CPU (its
// swiftshader helpers), and has starved a later gate's hydration budget into
// a false failure. The watchdog only fires while this process lives; this
// runs synchronously as it dies, so no browser can outlive its gate.
process.on('exit', () => {
  for (const proc of running) {
    try { proc.kill('SIGKILL'); } catch { /* already gone */ }
  }
});

/**
 * Fail a hung gate instead of stalling it forever. process.exit does not stop
 * child processes, so kill Chrome (and whatever `cleanup` owns) first.
 */
export const watchdog = (ms, cleanup = () => {}) =>
  setTimeout(() => {
    console.error(`Gate timed out after ${ms / 60_000} minutes.`);
    for (const proc of running) proc.kill('SIGKILL');
    cleanup();
    process.exit(1);
  }, ms).unref();

/** An OS-assigned, verified-free local port. */
const freePort = () =>
  new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolvePort(port));
    });
  });

export const launch = async (pageUrl) => {
  // A free port, not the old random draw in 9222–10221: a collision there let
  // a leftover browser answer /json/list, and the gate would silently test the
  // wrong page. No --user-data-dir: this Chrome's headless first run on a
  // fresh profile never commits the argv navigation (the tab sits at
  // about:blank while /json/list already reports the URL), so the default —
  // already-initialized — profile stays.
  const port = await freePort();
  const proc = spawn(CHROME, [
    '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--force-color-profile=srgb', '--disable-extensions',
    `--remote-debugging-port=${port}`, pageUrl,
  ], { stdio: 'ignore' });
  running.add(proc);
  proc.once('exit', () => running.delete(proc));

  for (let attempt = 0; attempt < 50; attempt++) {
    await sleep(200);
    if (proc.exitCode !== null || proc.signalCode !== null) break; // Chrome refused to start
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      // The URL match is the readiness AND ownership signal: the tab must have
      // committed the requested navigation, so a not-yet-loaded page or some
      // other instance on this port fails loudly instead of testing nothing.
      const target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl && t.url === pageUrl);
      if (target) return { proc, target };
    } catch { /* not up yet */ }
  }
  proc.kill('SIGKILL'); // SIGTERM is ignored by Chrome for Testing on macOS
  throw new Error(`Chromium did not expose a debugging target for ${pageUrl}`);
};

export const connect = async (target) => {
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

export const evaluate = async (send, expression) => {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text + ' ' + (exceptionDetails.exception?.description ?? ''));
  return result.value;
};

export const key = async (send, k, modifiers = 0) => {
  const codes = {
    Tab: { windowsVirtualKeyCode: 9, code: 'Tab', key: 'Tab' },
    Enter: { windowsVirtualKeyCode: 13, code: 'Enter', key: 'Enter' },
    Escape: { windowsVirtualKeyCode: 27, code: 'Escape', key: 'Escape' },
    ArrowDown: { windowsVirtualKeyCode: 40, code: 'ArrowDown', key: 'ArrowDown' },
    ArrowUp: { windowsVirtualKeyCode: 38, code: 'ArrowUp', key: 'ArrowUp' },
    ArrowRight: { windowsVirtualKeyCode: 39, code: 'ArrowRight', key: 'ArrowRight' },
    ArrowLeft: { windowsVirtualKeyCode: 37, code: 'ArrowLeft', key: 'ArrowLeft' },
    Home: { windowsVirtualKeyCode: 36, code: 'Home', key: 'Home' },
    End: { windowsVirtualKeyCode: 35, code: 'End', key: 'End' },
    F6: { windowsVirtualKeyCode: 117, code: 'F6', key: 'F6' },
  };
  const base = codes[k];
  // Enter must carry text, or the browser never performs the default action on a
  // focused button — handlers fire, but the button is not activated.
  const text = k === 'Enter' ? '\r' : undefined;
  await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', modifiers, ...base, ...(text ? { text } : {}) });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, ...base });
  await sleep(60);
};

/**
 * Shut the browser down and make sure it is gone. Chrome for Testing on macOS
 * ignores SIGTERM, and a live child keeps Node's event loop open, so a bare
 * proc.kill() left gates printing PASSED and then never exiting.
 */
export const shutdown = async (send, ws, proc) => {
  // The socket dies with the browser, so the reply may never arrive.
  await Promise.race([send('Browser.close').catch(() => {}), sleep(500)]);
  ws.close();
  if (proc.exitCode === null && proc.signalCode === null) {
    const exited = new Promise((r) => proc.once('exit', r));
    proc.kill('SIGTERM');
    await Promise.race([exited, sleep(1500)]);
    if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL');
  }
};
