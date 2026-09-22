'use client';

import { useEffect, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import type { Command } from 'prosemirror-state';
import type { FormatState } from './editorCommands';
import styles from './editor.module.css';

const FONTS = [
  { value: 'Default', label: 'Default' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: "'Courier New', monospace", label: 'Courier New' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: "'Times New Roman', serif", label: 'Times New Roman' },
];
const SIZES = ['11', '12', '13', '14', '16', '18', '24', '32'];

// Gray and orange are darkened from the design (#6B778C, #B65C02) so text set
// in them keeps 4.5:1 against the page (SC 1.4.3).
const TEXT_COLORS = [
  { name: 'Navy', value: '#172B4D' },
  { name: 'Gray', value: '#5E6C84' },
  { name: 'Red', value: '#C9372C' },
  { name: 'Orange', value: '#A54800' },
  { name: 'Green', value: '#216E4E' },
  { name: 'Blue', value: '#0C66E4' },
  { name: 'Purple', value: '#5E4DB2' },
];
const HIGHLIGHTS = [
  { name: 'Yellow', value: '#FFF0B3' },
  { name: 'Green', value: '#BAF3DB' },
  { name: 'Blue', value: '#CCE0FF' },
  { name: 'Purple', value: '#DFD8FD' },
];

type CommandKey = 'bold' | 'italic' | 'underline' | 'h1' | 'h2' | 'ul' | 'ol' | 'indent' | 'outdent' | 'clear';

/** Keep the editor's selection when a toolbar control is clicked with a mouse. */
const keepSelection = (e: MouseEvent) => e.preventDefault();

const ICONS: Record<string, ReactNode> = {
  outdent: <><polyline points="7 8 3 12 7 16" /><line x1="21" y1="12" x2="11" y2="12" /><line x1="21" y1="6" x2="11" y2="6" /><line x1="21" y1="18" x2="11" y2="18" /></>,
  indent: <><polyline points="3 8 7 12 3 16" /><line x1="21" y1="12" x2="11" y2="12" /><line x1="21" y1="6" x2="11" y2="6" /><line x1="21" y1="18" x2="11" y2="18" /></>,
  link: <><path d="M9 17H7A5 5 0 0 1 7 7h2" /><path d="M15 7h2a5 5 0 1 1 0 10h-2" /><line x1="8" y1="12" x2="16" y2="12" /></>,
  ul: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
  ol: <><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /><path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></>,
  clear: <><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>,
  headerFooter: <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /></>,
  highlight: <><path d="m9 11-6 6v3h9l3-3" /><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" /></>,
};

const Icon = ({ name, size = 17 }: { name: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[name]}
  </svg>
);

/**
 * The formatting toolbar. `role="toolbar"` promises one tab stop with arrow-key
 * movement inside it (APG toolbar pattern), so that is what this implements:
 * Tab enters and leaves in one step, Left/Right/Home/End move between controls.
 */
export function Toolbar({
  format,
  run,
  commands,
  onFontFamily,
  onFontSize,
  onTextColor,
  onHighlight,
  onLink,
  onImage,
  onHeaderFooter,
  headerFooterOpen,
}: {
  format: FormatState | null;
  run: (command: Command) => void;
  commands: Record<CommandKey, Command>;
  onFontFamily: (family: string) => void;
  onFontSize: (size: string) => void;
  onTextColor: (color: string) => void;
  onHighlight: (color: string | null) => void;
  onLink: () => void;
  onImage: () => void;
  onHeaderFooter: () => void;
  headerFooterOpen: boolean;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const current = useRef(0);
  const [popover, setPopover] = useState<'text' | 'highlight' | null>(null);
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]!.value);
  const [highlight, setHighlight] = useState<string | null>(null);

  const items = () => [...(barRef.current?.querySelectorAll<HTMLElement>('[data-tb]') ?? [])];

  // Roving tabindex, applied to the DOM so React never fights over it.
  useEffect(() => {
    items().forEach((el, i) => { el.tabIndex = i === current.current ? 0 : -1; });
  });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target.hasAttribute('data-tb')) return;
    const list = items();
    const i = list.indexOf(target);
    const moves: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: list.length - 1 };
    if (!(e.key in moves)) return;
    // Up/Down belong to the selects, which use them to change value.
    e.preventDefault();
    const next = (moves[e.key]! + list.length) % list.length;
    current.current = next;
    list.forEach((el, j) => { el.tabIndex = j === next ? 0 : -1; });
    list[next]?.focus();
  };

  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const i = items().indexOf(e.target as HTMLElement);
    if (i >= 0) current.current = i;
  };

  // Close a colour popover on outside click or Escape, returning focus to its trigger.
  useEffect(() => {
    if (!popover) return;
    const onDown = (e: globalThis.MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-popover-root]')) setPopover(null);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      barRef.current?.querySelector<HTMLElement>(`[data-popover-trigger="${popover}"]`)?.focus();
      setPopover(null);
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [popover]);

  const cmd = (key: CommandKey, label: string, content: ReactNode, pressed?: boolean, extra = '') => (
    <button
      type="button"
      data-tb
      className={`${styles.tbBtn} ${extra}`}
      aria-label={label}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      onMouseDown={keepSelection}
      onClick={() => run(commands[key])}
    >
      {content}
    </button>
  );

  const sep = <span className={styles.tbSep} aria-hidden="true" />;
  const f = format;

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Formatting"
      aria-controls="document-text"
      className={styles.toolbar}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      <div className={styles.tbGroup}>
        <select data-tb aria-label="Font family" className={styles.select} value={f?.fontFamily ?? 'Default'} onChange={(e) => onFontFamily(e.target.value)}>
          {FONTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select data-tb aria-label="Font size" className={`${styles.select} ${styles.selectNarrow}`} value={f?.fontSize ?? '16'} onChange={(e) => onFontSize(e.target.value)}>
          {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {sep}
      <div className={styles.tbGroup}>
        {cmd('bold', 'Bold', <b>B</b>, f?.bold ?? false)}
        {cmd('italic', 'Italic', <i>I</i>, f?.italic ?? false)}
        {cmd('underline', 'Underline', <u>U</u>, f?.underline ?? false)}
      </div>
      {sep}
      <div className={`${styles.tbGroup} ${styles.popoverRoot}`} data-popover-root>
        <button
          type="button"
          data-tb
          data-popover-trigger="text"
          className={`${styles.tbBtn} ${styles.tbColor}`}
          aria-label="Text color"
          aria-expanded={popover === 'text'}
          aria-haspopup="true"
          onMouseDown={keepSelection}
          onClick={() => setPopover(popover === 'text' ? null : 'text')}
        >
          <span className={styles.tbColorLetter}>A</span>
          <span className={styles.colorBar} style={{ background: textColor }} />
        </button>
        {popover === 'text' ? (
          <div className={styles.popover} role="group" aria-label="Text colors">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={styles.swatch}
                style={{ background: c.value }}
                aria-label={`${c.name} text`}
                aria-pressed={textColor === c.value}
                onMouseDown={keepSelection}
                onClick={() => { setTextColor(c.value); setPopover(null); onTextColor(c.value); }}
              />
            ))}
          </div>
        ) : null}
        <button
          type="button"
          data-tb
          data-popover-trigger="highlight"
          className={`${styles.tbBtn} ${styles.tbColor}`}
          aria-label="Highlight color"
          aria-expanded={popover === 'highlight'}
          aria-haspopup="true"
          onMouseDown={keepSelection}
          onClick={() => setPopover(popover === 'highlight' ? null : 'highlight')}
        >
          <Icon name="highlight" size={14} />
          <span className={`${styles.colorBar} ${highlight ? '' : styles.colorBarNone}`} style={highlight ? { background: highlight } : undefined} />
        </button>
        {popover === 'highlight' ? (
          <div className={`${styles.popover} ${styles.popoverSecond}`} role="group" aria-label="Highlight colors">
            {HIGHLIGHTS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={styles.swatch}
                style={{ background: c.value }}
                aria-label={`${c.name} highlight`}
                aria-pressed={highlight === c.value}
                onMouseDown={keepSelection}
                onClick={() => { setHighlight(c.value); setPopover(null); onHighlight(c.value); }}
              />
            ))}
            <button
              type="button"
              className={`${styles.swatch} ${styles.swatchNone}`}
              aria-label="Remove highlight"
              onMouseDown={keepSelection}
              onClick={() => { setHighlight(null); setPopover(null); onHighlight(null); }}
            />
          </div>
        ) : null}
      </div>
      {sep}
      <div className={styles.tbGroup}>
        {cmd('h1', 'Heading 1', 'H1', f?.h1 ?? false, styles.tbText)}
        {cmd('h2', 'Heading 2', 'H2', f?.h2 ?? false, styles.tbText)}
      </div>
      {sep}
      <div className={styles.tbGroup}>
        {cmd('outdent', 'Decrease indent', <Icon name="outdent" />)}
        {cmd('indent', 'Increase indent', <Icon name="indent" />)}
      </div>
      {sep}
      <div className={styles.tbGroup}>
        <button type="button" data-tb className={styles.tbBtn} aria-label="Insert link" onMouseDown={keepSelection} onClick={onLink}>
          <Icon name="link" />
        </button>
        {cmd('ul', 'Bulleted list', <Icon name="ul" />, f?.ul ?? false)}
        {cmd('ol', 'Numbered list', <Icon name="ol" />, f?.ol ?? false)}
      </div>
      {sep}
      {cmd('clear', 'Clear formatting', <Icon name="clear" />)}
      {sep}
      <button type="button" data-tb className={styles.tbBtn} aria-label="Insert image" onMouseDown={keepSelection} onClick={onImage}>
        <Icon name="image" />
      </button>
      <span className={styles.tbSpacer} />
      <button
        type="button"
        data-tb
        className={styles.tbBtn}
        aria-label="Edit header and footer"
        aria-haspopup="dialog"
        aria-expanded={headerFooterOpen}
        onMouseDown={keepSelection}
        onClick={onHeaderFooter}
      >
        <Icon name="headerFooter" size={16} />
      </button>
    </div>
  );
}
