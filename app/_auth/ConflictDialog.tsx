'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useAnnounce } from '../../design-system/primitives';
import { resolveConflict, useConflicts } from '../_data/sync';
import { Shell } from '../_editor/dialogs';
import styles from '../_editor/editor.module.css';

/**
 * A document edited here and saved on another device since (sync.ts): the
 * person chooses what to keep, one document at a time, from wherever they
 * are. Keep both is where focus starts: nothing is lost. "Decide later"
 * leaves the document unsynced; the save status's Resolve reopens this.
 */

const OPEN_EVENT = 'ada:open-conflicts';

/** Show the choice again after "Decide later". */
export function openConflicts(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const when = (iso: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;
};

export function ConflictDialog() {
  const conflicts = useConflicts();
  const announce = useAnnounce();
  const [later, setLater] = useState<ReadonlySet<string>>(new Set());
  const first = useRef<HTMLButtonElement>(null);
  const current = conflicts.find((c) => !later.has(c.id)) ?? null;

  useEffect(() => {
    const reopen = () => setLater(new Set());
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  if (!current) return null;
  const gone = current.server === null;
  const savedAt = when(current.savedAt);
  const choose = (choice: 'mine' | 'theirs' | 'both') => {
    resolveConflict(current.id, choice);
    const name = `“${current.title}”`;
    if (choice === 'both') announce(gone ? `Kept your edits as ${name} (edits from this device).` : `Kept both. Their version is ${name}; your edits are in “${current.title} (edits from this device)”.`);
    else if (choice === 'mine') announce(gone ? `Restored ${name} with your edits.` : `Kept your edits to ${name}. They replace the other device’s version.`);
    else announce(gone ? `Discarded your edits to ${name}.` : `Kept the other device’s version of ${name}. Your edits were discarded.`);
  };

  const option = (choice: 'mine' | 'theirs' | 'both', label: string, hint: string, ref?: RefObject<HTMLButtonElement | null>) => (
    <div className={styles.conflictOption}>
      <button ref={ref} type="button" className={choice === 'both' ? styles.btnPrimary : styles.btnSubtle} onClick={() => choose(choice)} aria-describedby={`conflict-${choice}`}>{label}</button>
      <p id={`conflict-${choice}`} className={styles.choiceHint}>{hint}</p>
    </div>
  );

  return (
    <Shell
      open
      onOpenChange={(o) => { if (!o) setLater((s) => new Set([...s, current.id])); }}
      title={gone ? `“${current.title}” was deleted on another device` : `“${current.title}” was changed on another device`}
      description={gone
        ? 'It was deleted on another device, but this device has edits to it that weren’t saved to your account. Choose what to do with them.'
        : `Another device saved a newer version${savedAt ? ` (${savedAt})` : ''}, and this device has edits to it that weren’t saved to your account yet. Choose what to keep.`}
      initialFocus={first}
      footer={<Dialog.Close className={styles.btnSubtle} type="button">Decide later</Dialog.Close>}
    >
      {gone ? (
        <>
          {option('both', 'Keep my edits as a new document', 'It stays deleted; your edits become a new document.', first)}
          {option('mine', 'Restore it with my edits', 'It comes back, with your edits.')}
          {option('theirs', 'Discard my edits', 'It stays deleted, and your edits are gone.')}
        </>
      ) : (
        <>
          {option('both', 'Keep both', 'Their version stays as it is; your edits become a new document beside it.', first)}
          {option('mine', 'Keep mine', 'Your edits replace their version.')}
          {option('theirs', 'Keep theirs', 'Their version replaces yours; your edits are discarded.')}
        </>
      )}
    </Shell>
  );
}
