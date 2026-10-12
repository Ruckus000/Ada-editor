'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '../design-system/primitives';
import { DESK, isAppPath } from './_site/routes';
import { report } from './_site/sentry';
import { StatusScreen } from './_status/StatusScreen';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); report(error); }, [error]);
  // In the app, the way out is the desk; on a public page, anyone may be
  // reading, and the desk would ask a visitor to sign in.
  const inApp = isAppPath(usePathname());
  return (
    <StatusScreen
      title="This page stopped working"
      actions={<><Button variant="primary" onClick={reset}>Try again</Button>{inApp ? <Link href={DESK}>Back to all documents</Link> : <Link href="/">Go to the home page</Link>}</>}
    >
      {inApp ? 'Try again. If it stops again, go back to all documents and open it from there.' : 'Try again. If it stops again, start from the home page.'}
    </StatusScreen>
  );
}
