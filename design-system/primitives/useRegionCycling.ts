import { useEffect } from 'react';

/**
 * `F6` / `Shift+F6` cycling between the application's landmark regions.
 *
 * Adopted from Grammarly, which is the one part of their keyboard model worth
 * copying outright: landmark-level cycling is the right primitive when a large
 * editing surface and a parallel findings region compete for the same keyboard.
 *
 * Unlike arrow keys, `F6` is not intercepted by screen reader browse mode, so
 * this works for assistive-technology users as well as sighted keyboard users.
 * That is why region cycling — not the arrow keys — is the navigation
 * affordance the product actually leans on.
 *
 * Each region must be focusable. Give it `tabIndex={-1}` so it can receive
 * programmatic focus without entering the tab order.
 *
 * Takes a read-only structural type rather than `RefObject<HTMLElement>` so a
 * `RefObject<HTMLDivElement>` is assignable: React's `RefObject` is mutable and
 * therefore invariant, which would otherwise reject every concrete element ref.
 */
export interface RegionRef {
  readonly current: HTMLElement | null;
}

export function useRegionCycling(regions: ReadonlyArray<RegionRef>): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F6') return;

      const elements = regions
        .map((r) => r.current)
        .filter((el): el is HTMLElement => el !== null);
      if (elements.length === 0) return;

      event.preventDefault();

      const active = document.activeElement;
      // Which region currently holds focus? `contains` rather than identity,
      // because focus is usually on a control inside the region.
      const currentIndex = elements.findIndex((el) => el === active || el.contains(active));

      const step = event.shiftKey ? -1 : 1;
      const nextIndex =
        currentIndex === -1
          ? 0
          : (currentIndex + step + elements.length) % elements.length;

      elements[nextIndex]?.focus();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [regions]);
}
