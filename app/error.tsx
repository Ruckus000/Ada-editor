'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '../design-system/primitives';
import { StatusScreen } from './_status/StatusScreen';

// ponytail: logs to the browser console only; add an error-reporting service
// once there is real traffic to learn from.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <StatusScreen
      title="This page stopped working"
      actions={<><Button variant="primary" onClick={reset}>Try again</Button><Link href="/">Back to all documents</Link></>}
    >
      Try again. If it stops again, go back to all documents and open it from there.
    </StatusScreen>
  );
}
