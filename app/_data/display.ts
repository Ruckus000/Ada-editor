import { getClient } from './supabase';

/**
 * Display preferences: theme and text size. Kept in this browser so the very
 * first paint is right (PREPAINT, in the root layout), and in the account's
 * user metadata so they follow the person to another device. Both stores are
 * untrusted: every value is checked against the lists below before it touches
 * <html>.
 */
export const THEMES = ['system', 'light', 'dark'] as const;
export const TEXT_SIZES = [100, 115, 130, 150] as const;
export type Theme = (typeof THEMES)[number];
export type TextSize = (typeof TEXT_SIZES)[number];
export type Display = { theme: Theme; text: TextSize };

export const DEFAULT_DISPLAY: Display = { theme: 'system', text: 100 };
const KEY = 'ada.display';

/** Anything (storage, metadata) → a valid Display; unknown values fall back to the defaults. */
export function parseDisplay(value: unknown): Display {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    theme: THEMES.includes(v.theme as Theme) ? (v.theme as Theme) : DEFAULT_DISPLAY.theme,
    text: TEXT_SIZES.includes(v.text as TextSize) ? (v.text as TextSize) : DEFAULT_DISPLAY.text,
  };
}

export function readDisplay(): Display {
  try { return parseDisplay(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return DEFAULT_DISPLAY; }
}

/** System theme and default size are the absence of an attribute: tokens.css
 *  follows the OS unless data-theme pins a theme. */
export function applyDisplay(d: Display): void {
  const root = document.documentElement;
  if (d.theme === 'system') delete root.dataset.theme; else root.dataset.theme = d.theme;
  if (d.text === 100) delete root.dataset.text; else root.dataset.text = String(d.text);
}

function cache(d: Display): void {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage blocked: this page still shows it */ }
}

/** A change made here: show it, keep it in this browser, and save it to the account if signed in. */
export async function saveDisplay(d: Display): Promise<void> {
  applyDisplay(d);
  cache(d);
  const client = getClient();
  if (!client) return;
  const { data } = await client.auth.getSession();
  if (!data.session) return;
  const { error } = await client.auth.updateUser({ data: { display: d } });
  if (error) console.error('Could not save display settings to the account', error);
}

/** Signing in on this device: the account's settings win, when it has any. */
export function adoptDisplay(fromAccount: unknown): void {
  if (!fromAccount) return;
  const d = parseDisplay(fromAccount);
  applyDisplay(d);
  cache(d);
}

/**
 * Runs in <head> before the first paint, so a dark-mode reader never sees a
 * white flash and text never jumps size. Plain JS, no imports; keep it in step
 * with parseDisplay. Also marks that a session exists, so the public header
 * can hide signed-out links until it knows (SiteAccount).
 */
export const PREPAINT = `(() => {
  try {
    const root = document.documentElement;
    const d = JSON.parse(localStorage.getItem('${KEY}') || 'null') || {};
    if (d.theme === 'light' || d.theme === 'dark') root.dataset.theme = d.theme;
    if ([115, 130, 150].includes(d.text)) root.dataset.text = String(d.text);
    if (Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k))) root.dataset.session = '';
  } catch (e) {}
})();`;
