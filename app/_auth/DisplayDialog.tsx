'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, useAnnounce } from '../../design-system/primitives';
import { readDisplay, saveDisplay } from '../_data/display';
import type { Display, TextSize, Theme } from '../_data/display';
import './display.css';

const THEME_LABEL: Record<Theme, string> = { system: 'Match this device', light: 'Light', dark: 'Dark' };
const TEXT_LABEL: Record<TextSize, string> = { 100: 'Default', 115: 'Large', 130: 'Larger', 150: 'Largest' };

/**
 * Theme and text size. A native <dialog>: focus trap, Escape, backdrop and
 * focus return come with the platform. Each choice applies at once (and is
 * announced), so there is nothing to confirm; Done just closes.
 */
export function DisplayDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const announce = useAnnounce();
  const [d, setD] = useState<Display>({ theme: 'system', text: 100 });
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) { setD(readDisplay()); dialog.showModal(); }
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const choose = (next: Display, said: string) => { setD(next); void saveDisplay(next); announce(said); };
  return (
    <dialog ref={ref} className="display" aria-labelledby="display-title" onClose={onClose}>
      <h2 id="display-title" className="display__title">Display</h2>
      <fieldset className="display__group">
        <legend>Theme</legend>
        {(Object.keys(THEME_LABEL) as Theme[]).map((t) => (
          <label key={t} className="display__option">
            <input type="radio" name="display-theme" value={t} checked={d.theme === t} onChange={() => choose({ ...d, theme: t }, `Theme: ${THEME_LABEL[t]}.`)} />
            {THEME_LABEL[t]}
          </label>
        ))}
      </fieldset>
      <fieldset className="display__group">
        <legend>Text size</legend>
        {(Object.keys(TEXT_LABEL).map(Number) as TextSize[]).map((s) => (
          <label key={s} className="display__option">
            <input type="radio" name="display-text" value={s} checked={d.text === s} onChange={() => choose({ ...d, text: s }, `Text size: ${TEXT_LABEL[s]}.`)} />
            <span style={{ fontSize: `${s}%` }}>{TEXT_LABEL[s]}</span>
          </label>
        ))}
      </fieldset>
      <p className="display__note">Saved to your account when you’re signed in, so your other devices match. Exports aren’t affected.</p>
      <div className="display__actions">
        <Button variant="primary" onClick={() => ref.current?.close()}>Done</Button>
      </div>
    </dialog>
  );
}
