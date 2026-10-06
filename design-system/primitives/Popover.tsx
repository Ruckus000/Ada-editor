import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Button } from './Button';
import { VisuallyHidden } from './VisuallyHidden';

/**
 * A button that shows a small panel of links and actions (disclosure pattern:
 * Tab moves through the items, not arrow keys). Closes on Escape, an outside
 * click, focus leaving, or choosing an item, and hands focus back to its
 * button first, so a dialog opened from an item returns focus somewhere that
 * still exists. `closeOnClick={false}` keeps it open for a panel holding a
 * form control (a select would close it on the first click otherwise).
 */
export function Popover({ label, icon, variant = 'ghost', showLabel = false, closeOnClick = true, className = '', buttonClassName = '', children }: {
  label: string;
  icon?: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  /** The label as visible text; otherwise icon-only, the label for screen readers. */
  showLabel?: boolean;
  closeOnClick?: boolean;
  className?: string | undefined;
  buttonClassName?: string | undefined;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('focusin', away);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('focusin', away); };
  }, [open]);
  const close = () => { setOpen(false); button.current?.focus(); };
  return (
    <div ref={wrap} className={`ada-pop ${className}`.trim()} onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape' && open) { e.stopPropagation(); close(); } }}>
      <Button ref={button} variant={variant} iconOnly={!showLabel} className={buttonClassName} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {icon}
        {showLabel ? <span className="ada-pop__label">{label}</span> : <VisuallyHidden>{label}</VisuallyHidden>}
      </Button>
      {open ? <ul role="list" id={id} className="ada-pop__panel" onClick={closeOnClick ? close : undefined}>{children}</ul> : null}
    </div>
  );
}
