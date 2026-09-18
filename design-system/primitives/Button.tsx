import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Icon-only buttons must still supply an accessible name. */
  iconOnly?: boolean;
}

/**
 * Every interactive target in the system meets SC 2.5.8 (24px minimum) via
 * --ada-target-min, and inherits the one focus ring defined in tokens.css.
 * There is no `size="xs"` escape hatch, because that is how target-size
 * violations get introduced.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', iconOnly = false, className = '', type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`ada-button ada-button--${variant}${iconOnly ? ' ada-button--icon' : ''} ${className}`.trim()}
      {...rest}
    />
  );
});
