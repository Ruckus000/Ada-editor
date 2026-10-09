import Link from 'next/link';
import { StatusScreen } from './_status/StatusScreen';

export default function NotFound() {
  return (
    <StatusScreen title="Page not found" actions={<Link href="/">Go to the home page</Link>}>
      There’s no page at this address. Check the link, or start from the home page.
    </StatusScreen>
  );
}
