import type { Metadata } from 'next';
import { Dashboard } from './_dashboard/Dashboard';

export const metadata: Metadata = { title: 'Remediation overview · Ada Editor' };

export default function Page() {
  return <Dashboard />;
}
