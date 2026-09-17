import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type Announce = (message: string, urgency?: 'polite' | 'assertive') => void;

const AnnouncerContext = createContext<Announce>(() => {});

export const useAnnounce = () => useContext(AnnouncerContext);

/**
 * A single live region for the whole app.
 *
 * Grammarly's model puts the outcome of an action in a floating card that a
 * screen reader user may never reach. Here, every accept/dismiss states its
 * result and what remains — including how many findings still need a human,
 * which is the number that actually determines whether the document is done.
 */
export function LiveAnnouncer({ children }: { children: ReactNode }) {
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const announce = useCallback<Announce>((message, urgency = 'polite') => {
    const set = urgency === 'assertive' ? setAssertive : setPolite;
    // Clear first: re-announcing identical text is otherwise dropped by most
    // screen readers because the node's text never changed.
    set('');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => set(message), 60);
  }, []);

  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div className="ada-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="ada-visually-hidden" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </AnnouncerContext.Provider>
  );
}
