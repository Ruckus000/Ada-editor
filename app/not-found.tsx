import Link from 'next/link';
import { StatusScreen } from './_status/StatusScreen';

export default function NotFound() {
  return (
    <StatusScreen title="Page not found" actions={<Link href="/">Back to all documents</Link>}>
      There’s no page at this address. Check the link, or go back to all documents.
    </StatusScreen>
  );
}
