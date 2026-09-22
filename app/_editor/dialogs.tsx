'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Section } from './findings';
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  onSubmit?: (e: FormEvent) => void;
}) {
  // These dialogs open from state, not a Dialog.Trigger, so Radix has nowhere
  // to return focus on close. Remember what had focus when we opened.
  const returnTo = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== 'undefined') returnTo.current = document.activeElement as HTMLElement | null;
  wasOpen.current = open;

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
          onCloseAutoFocus={(e) => {
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
  const id = useId();
  useEffect(() => { if (open) setValue(initial); }, [open, initial]);

  return (
    <Shell
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Link"
      description="The selected text becomes the link. Make sure it says where the link goes — “click here” fails SC 2.4.4."
      onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSave(value.trim()); }}
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
        <input id={id} className={styles.input} type="url" inputMode="url" placeholder="https://" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
    </Shell>
  );
}

/* ---------- header & footer ---------- */

export type Align = 'left' | 'center' | 'right';

export interface SectionState {
  text: string;
  align: Align;
  spacing: number;
  image: { id: string; alt: string } | null;
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
            <span className={styles.imageThumb} aria-hidden="true"><ImageIcon size={20} /></span>
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

export function ImageIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}
