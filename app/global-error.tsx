'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import '../design-system/tokens.css';
import '../design-system/primitives/primitives.css';
import { Button } from '../design-system/primitives';
import { report } from './_site/sentry';
import { StatusScreen } from './_status/StatusScreen';

// When the root layout itself breaks (Providers, AuthGate), this replaces it,
// so it brings its own <html> and styles; app/error.tsx covers everything else.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); report(error); }, [error]);
  return (
    <html lang="en">
      <body>
        <StatusScreen
          title="Ada Editor stopped working"
          actions={<><Button variant="primary" onClick={reset}>Try again</Button><Link href="/">Go to the home page</Link></>}
        >
          Try again. If it stops again, start from the home page.
        </StatusScreen>
      </body>
    </html>
  );
}
