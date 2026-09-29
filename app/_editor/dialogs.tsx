'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { safeHref } from './editorSchema';
import type { FigureAlign, FigureSize } from './editorSchema';
import type { Section } from './findings';
import type { SectionImage } from '../_data/store';
import { acquireUrl, releaseUrl } from '../_data/images';
import styles from './editor.module.css';

/**
 * Radix dialogs replace the design's window.prompt() calls. A native prompt
 * cannot be styled, cannot explain *why* alt text matters, and does not return
 * focus predictably; Radix traps focus, closes on Escape and restores focus to
 * the control that opened it.
 */

function Shell({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  onSubmit,
  restoreFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  onSubmit?: (e: FormEvent) => void;
  /** Called as the dialog closes: false when it has put focus somewhere else
   *  itself (saving moved on into the document), so the opener isn't refocused. */
  restoreFocus?: () => boolean;
}) {
  // These dialogs open from state, not a Dialog.Trigger, so Radix has nowhere
  // to return focus on close. Remember what had focus when we opened: on
  // open-autofocus focus has not moved yet, so it is still the opener.
  const returnTo = useRef<HTMLElement | null>(null);

  const body = (
    <>
      <div className={styles.dialogBody}>{children}</div>
      <div className={styles.dialogFooter}>{footer}</div>
    </>
  );
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={`${styles.palette} ${styles.overlay}`} />
        <Dialog.Content
          className={`${styles.palette} ${styles.dialog}`}
          {...(description ? {} : { 'aria-describedby': undefined })}
          onOpenAutoFocus={() => { returnTo.current = document.activeElement as HTMLElement | null; }}
          onCloseAutoFocus={(e) => {
            if (restoreFocus && !restoreFocus()) { e.preventDefault(); return; }
            if (!returnTo.current?.isConnected) return;
            e.preventDefault();
            returnTo.current.focus();
          }}
        >
          <div className={styles.dialogHeader}>
            <Dialog.Title className={styles.dialogTitle}>{title}</Dialog.Title>
            <Dialog.Close className={styles.iconBtn} aria-label={`Close ${title.toLowerCase()}`}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 4l12 12M16 4L4 16" /></svg>
            </Dialog.Close>
          </div>
          {description ? <Dialog.Description className={styles.dialogDesc}>{description}</Dialog.Description> : null}
          {onSubmit ? <form onSubmit={onSubmit}>{body}</form> : body}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------- alt text ---------- */

export function AltTextDialog({
  open,
  label,
  initial,
  onSave,
  onClose,
}: {
  open: boolean;
  label: string;
  initial: string;
  onSave: (alt: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const id = useId();
  useEffect(() => { if (open) setValue(initial); }, [open, initial]);

  return (
    <Shell
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Alternative text"
      description={`Describe what this ${label} shows for people who cannot see it. Leave it empty only if the image is purely decorative.`}
      onSubmit={(e) => { e.preventDefault(); onSave(value.trim()); }}
      footer={
        <>
          <Dialog.Close className={styles.btnSubtle} type="button">Cancel</Dialog.Close>
          <button type="submit" className={styles.btnPrimary}>Save alt text</button>
        </>
      }
    >
      <label className={styles.field} htmlFor={id}>
        <span className={styles.fieldLabel}>Description</span>
        <textarea id={id} className={styles.textarea} rows={3} value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
    </Shell>
  );
}

/* ---------- picture size and position ---------- */

export const SIZE_NAMES: Record<FigureSize | 'original', string> = { original: 'Original', small: 'Small', medium: 'Medium', large: 'Large', full: 'Full width' };
export const ALIGN_NAMES: Record<FigureAlign, string> = { left: 'Left', center: 'Centre', right: 'Right' };
const SIZE_HINTS: Record<FigureSize | 'original', string> = { original: 'its own size, no wider than the page', small: 'a quarter of the page width', medium: 'half the page width', large: 'three quarters of the page width', full: 'the whole page width' };

export function FigureLayoutDialog({
  open,
  label,
  initial,
  onSave,
  onClose,
}: {
  open: boolean;
  label: string;
  initial: { size: FigureSize | null; align: FigureAlign };
  onSave: (layout: { size: FigureSize | null; align: FigureAlign }) => void;
  onClose: () => void;
}) {
  const [size, setSize] = useState<FigureSize | 'original'>(initial.size ?? 'original');
  const [align, setAlign] = useState<FigureAlign>(initial.align);
  const id = useId();
  useEffect(() => {
    if (open) { setSize(initial.size ?? 'original'); setAlign(initial.align); }
  }, [open, initial.size, initial.align]);
  const full = size === 'full';

  return (
    <Shell
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Size and position"
      description={`How wide this ${label} is on the page, and where it sits. Exports use the same.`}
      onSubmit={(e) => { e.preventDefault(); onSave({ size: size === 'original' ? null : size, align }); }}
      footer={
        <>
          <Dialog.Close className={styles.btnSubtle} type="button">Cancel</Dialog.Close>
          <button type="submit" className={styles.btnPrimary}>Save</button>
        </>
      }
    >
      <fieldset className={styles.choices}>
        <legend className={styles.fieldLabel}>Size</legend>
        {(['original', 'small', 'medium', 'large', 'full'] as const).map((s) => (
          <label key={s} className={styles.check}>
            <input type="radio" name={`${id}-size`} value={s} checked={size === s} onChange={() => setSize(s)} />
            <span>{SIZE_NAMES[s]} <span className={styles.choiceHint}>({SIZE_HINTS[s]})</span></span>
          </label>
        ))}
      </fieldset>
      <fieldset className={styles.choices} disabled={full} aria-describedby={full ? `${id}-full` : undefined}>
        <legend className={styles.fieldLabel}>Alignment</legend>
        {(['left', 'center', 'right'] as const).map((a) => (
          <label key={a} className={styles.check}>
            <input type="radio" name={`${id}-align`} value={a} checked={align === a} onChange={() => setAlign(a)} />
            <span>{ALIGN_NAMES[a]}</span>
          </label>
        ))}
        {full ? <p id={`${id}-full`} className={styles.choiceHint}>A full-width picture fills the line, so it has no alignment.</p> : null}
      </fieldset>
    </Shell>
  );
}

/* ---------- tables ---------- */

const MAX_ROWS = 50;
const MAX_COLS = 10;

export function InsertTableDialog({
  open,
  onInsert,
  onClose,
  focusDocument,
}: {
  open: boolean;
  onInsert: (table: { rows: number; cols: number; headerRow: boolean; headerColumn: boolean; caption: string }) => void;
  onClose: () => void;
  /** Where focus goes after inserting: into the new table. */
  focusDocument: () => void;
}) {
  const [rows, setRows] = useState('3');
  const [cols, setCols] = useState('2');
  const [headerRow, setHeaderRow] = useState(true);
  const [headerColumn, setHeaderColumn] = useState(false);
  const [caption, setCaption] = useState('');
  const [invalid, setInvalid] = useState<'rows' | 'cols' | null>(null);
  const inserted = useRef(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    setRows('3'); setCols('2'); setHeaderRow(true); setHeaderColumn(false); setCaption(''); setInvalid(null);
    inserted.current = false;
  }, [open]);
  const whole = (v: string, max: number) => (/^\d+$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= max ? Number(v) : null);
  const number = (key: 'rows' | 'cols', label: string, value: string, set: (v: string) => void, max: number) => (
    <>
      <label className={styles.field} htmlFor={`${id}-${key}`}>
        <span className={styles.fieldLabel}>{label}</span>
        <input
          id={`${id}-${key}`}
          className={styles.input}
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          value={value}
          aria-invalid={invalid === key}
          {...(invalid === key ? { 'aria-describedby': `${id}-${key}-error` } : {})}
          onChange={(e) => { set(e.target.value); setInvalid(null); }}
        />
      </label>
      {invalid === key ? <p id={`${id}-${key}-error`} className={styles.fieldError} role="alert">{`Use a whole number from 1 to ${max}.`}</p> : null}
    </>
  );

  return (
    <Shell
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Insert table"
      description="Header cells tell screen reader users what each value in the table means, so a header row is on unless the table really has none."
      restoreFocus={() => {
        if (!inserted.current) return true;
        focusDocument();
        return false;
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const r = whole(rows, MAX_ROWS);
        const c = whole(cols, MAX_COLS);
        if (r === null) { setInvalid('rows'); return; }
        if (c === null) { setInvalid('cols'); return; }
        inserted.current = true;
        onInsert({ rows: r, cols: c, headerRow, headerColumn, caption });
      }}
      footer={
        <>
          <Dialog.Close className={styles.btnSubtle} type="button">Cancel</Dialog.Close>
          <button type="submit" className={styles.btnPrimary}>Insert table</button>
        </>
      }
    >
      {number('rows', 'Rows', rows, setRows, MAX_ROWS)}
      {number('cols', 'Columns', cols, setCols, MAX_COLS)}
      <label className={styles.check}>
        <input type="checkbox" checked={headerRow} onChange={(e) => setHeaderRow(e.target.checked)} />
        <span>First row is a header row</span>
      </label>
      <label className={styles.check}>
        <input type="checkbox" checked={headerColumn} onChange={(e) => setHeaderColumn(e.target.checked)} />
        <span>First column is a header column</span>
      </label>
      <label className={styles.field} htmlFor={`${id}-caption`}>
        <span className={styles.fieldLabel}>Caption (optional)</span>
        <input id={`${id}-caption`} className={styles.input} type="text" value={caption} onChange={(e) => setCaption(e.target.value)} />
      </label>
    </Shell>
  );
}

export function TableCaptionDialog({
  open,
  initial,
  onSave,
  onClose,
  focusDocument,
}: {
  open: boolean;
  initial: string;
  onSave: (caption: string) => void;
  onClose: () => void;
  focusDocument: () => void;
}) {
  const [value, setValue] = useState(initial);
  const saved = useRef(false);
  const id = useId();
  useEffect(() => { if (open) { setValue(initial); saved.current = false; } }, [open, initial]);

  return (
    <Shell
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Table caption"
      description="A caption names the table, so people can tell what it is before reading it. Leave it empty for no caption."
      restoreFocus={() => {
        if (!saved.current) return true;
        focusDocument();
        return false;
      }}
      onSubmit={(e) => { e.preventDefault(); saved.current = true; onSave(value.trim()); }}
      footer={
        <>
          <Dialog.Close className={styles.btnSubtle} type="button">Cancel</Dialog.Close>
          <button type="submit" className={styles.btnPrimary}>Save caption</button>
        </>
      }
    >
      <label className={styles.field} htmlFor={id}>
        <span className={styles.fieldLabel}>Caption</span>
        <input id={id} className={styles.input} type="text" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
    </Shell>
  );
}

/* ---------- link ---------- */

export function LinkDialog({
  open,
  initial,
  onSave,
  onRemove,
  onClose,
}: {
  open: boolean;
  initial: string;
  onSave: (href: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const id = useId();
  useEffect(() => { if (open) { setValue(initial); setInvalid(false); } }, [open, initial]);

  return (
    <Shell
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Link"
      description="The selected text becomes the link. Make sure it says where the link goes — “click here” fails SC 2.4.4."
      onSubmit={(e) => {
        e.preventDefault();
        const href = safeHref(value.trim());
        if (href) onSave(href);
        else setInvalid(true);
      }}
      footer={
        <>
          {initial ? <button type="button" className={styles.btnSubtle} onClick={onRemove}>Remove link</button> : null}
          <Dialog.Close className={styles.btnSubtle} type="button">Cancel</Dialog.Close>
          <button type="submit" className={styles.btnPrimary}>Save link</button>
        </>
      }
    >
      <label className={styles.field} htmlFor={id}>
        <span className={styles.fieldLabel}>Address</span>
        {/* type="text": our check, not the browser's, decides what is valid (it also
            allows relative, mailto: and tel: links, which type="url" rejects). */}
        <input
          id={id}
          className={styles.input}
          type="text"
          inputMode="url"
          placeholder="https://"
          value={value}
          aria-invalid={invalid}
          {...(invalid ? { 'aria-describedby': `${id}-error` } : {})}
          onChange={(e) => { setValue(e.target.value); setInvalid(false); }}
        />
      </label>
      {invalid ? (
        <p id={`${id}-error`} className={styles.fieldError} role="alert">Use a web, email or phone address.</p>
      ) : null}
    </Shell>
  );
}

/* ---------- new document ---------- */

export function NewDocumentDialog({
  open,
  onCreate,
  onClose,
}: {
  open: boolean;
  onCreate: (title: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const id = useId();
  useEffect(() => { if (open) { setValue(''); setInvalid(false); } }, [open]);

  return (
    <Shell
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="New document"
      description="The title becomes the document’s main heading, so it starts with the structure screen readers navigate by."
      onSubmit={(e) => {
        e.preventDefault();
        const title = value.trim();
        if (title) onCreate(title);
        else setInvalid(true);
      }}
      footer={
        <>
          <Dialog.Close className={styles.btnSubtle} type="button">Cancel</Dialog.Close>
          <button type="submit" className={styles.btnPrimary}>Create document</button>
        </>
      }
    >
      <label className={styles.field} htmlFor={id}>
        <span className={styles.fieldLabel}>Title</span>
        <input
          id={id}
          className={styles.input}
          type="text"
          maxLength={200}
          // Start in the one field this dialog is for, not on Close: Radix
          // keeps focus that is already inside the dialog when it opens.
          autoFocus
          value={value}
          aria-invalid={invalid}
          {...(invalid ? { 'aria-describedby': `${id}-error` } : {})}
          onChange={(e) => { setValue(e.target.value); setInvalid(false); }}
        />
      </label>
      {invalid ? (
        <p id={`${id}-error`} className={styles.fieldError} role="alert">Give the document a title.</p>
      ) : null}
    </Shell>
  );
}

/* ---------- header & footer ---------- */

export type Align = 'left' | 'center' | 'right';

export interface SectionState {
  text: string;
  align: Align;
  spacing: number;
  image: SectionImage | null;
}

const ALIGN_ICONS: Record<Align, string> = {
  left: 'M3 5h14M3 10h9M3 15h14',
  center: 'M3 5h14M6.5 10h7M3 15h14',
  right: 'M3 5h14M8 10h9M3 15h14',
};

export function HeaderFooterDialog({
  open,
  onOpenChange,
  tab,
  onTab,
  sections,
  onChange,
  onSpacing,
  onInsertImage,
  onEditImageAlt,
  onRemoveImage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: Section;
  onTab: (tab: Section) => void;
  sections: Record<Section, SectionState>;
  onChange: (key: Section, patch: Partial<SectionState>) => void;
  onSpacing: (key: Section, delta: number) => void;
  onInsertImage: (key: Section) => void;
  onEditImageAlt: (key: Section) => void;
  onRemoveImage: (key: Section) => void;
}) {
  const s = sections[tab];
  const textId = useId();
  const tabName = tab === 'header' ? 'Header' : 'Footer';

  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title="Header & footer"
      footer={<Dialog.Close className={styles.btnPrimary} type="button">Done</Dialog.Close>}
    >
      <div role="group" aria-label="Section to edit" className={styles.tabs}>
        {(['header', 'footer'] as const).map((key) => (
          <button key={key} type="button" className={styles.tab} aria-pressed={tab === key} onClick={() => onTab(key)}>
            {key === 'header' ? 'Header' : 'Footer'}
          </button>
        ))}
      </div>

      <label className={styles.field} htmlFor={textId}>
        <span className={styles.fieldLabel}>{`${tabName} text`}</span>
        <input id={textId} className={styles.input} type="text" value={s.text} onChange={(e) => onChange(tab, { text: e.target.value })} />
      </label>

      <div role="group" aria-labelledby={`${textId}-align`}>
        <div id={`${textId}-align`} className={styles.fieldLabel}>Alignment</div>
        <div className={styles.segmented}>
          {(['left', 'center', 'right'] as const).map((a) => (
            <button key={a} type="button" className={styles.segBtn} aria-pressed={s.align === a} aria-label={`Align ${a}`} onClick={() => onChange(tab, { align: a })}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d={ALIGN_ICONS[a]} /></svg>
            </button>
          ))}
        </div>
      </div>

      <div role="group" aria-labelledby={`${textId}-spacing`}>
        <div id={`${textId}-spacing`} className={styles.fieldLabel}>Distance from edge</div>
        <div className={styles.stepper}>
          <button type="button" className={styles.stepBtn} aria-label="Decrease spacing" onClick={() => onSpacing(tab, -2)}>−</button>
          <span className={styles.stepValue}>{`${s.spacing}px`}</span>
          <button type="button" className={styles.stepBtn} aria-label="Increase spacing" onClick={() => onSpacing(tab, 2)}>+</button>
        </div>
      </div>

      <div>
        <div className={styles.fieldLabel}>Image</div>
        {s.image ? (
          <div className={styles.imageRow}>
            <span className={styles.imageThumb} aria-hidden="true">{s.image.image ? <StoredImg imageKey={s.image.image} fallback={20} /> : <ImageIcon size={20} />}</span>
            <div className={styles.imageMeta}>
              {s.image.alt
                ? <span className={styles.altText}>{`Alt text: “${s.image.alt}”`}</span>
                : <span className={styles.missingBadge}>Missing alt text</span>}
            </div>
            <button type="button" className={styles.linkBtn} onClick={() => onEditImageAlt(tab)}>
              {s.image.alt ? `Edit ${tab} image alt text` : `Add ${tab} image alt text`}
            </button>
            <button type="button" className={styles.linkBtnMuted} onClick={() => onRemoveImage(tab)}>{`Remove ${tab} image`}</button>
          </div>
        ) : (
          <button type="button" className={styles.dashedBtn} onClick={() => onInsertImage(tab)}>
            <ImageIcon size={15} />
            {`Insert logo or image in ${tab}`}
          </button>
        )}
      </div>
    </Shell>
  );
}

/** A stored picture (images.ts), decorative: whatever shows it carries the name.
 *  The icon stands in while it loads, or if it can't be had. */
export function StoredImg({ imageKey, fallback }: { imageKey: string; fallback: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void acquireUrl(imageKey).then((u) => { if (live) setUrl(u); });
    return () => { live = false; setUrl(null); releaseUrl(imageKey); };
  }, [imageKey]);
  return url ? <img src={url} alt="" draggable={false} className={styles.storedImg} /> : <ImageIcon size={fallback} />;
}

export function ImageIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}
