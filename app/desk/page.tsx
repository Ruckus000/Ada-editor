import type { Metadata } from 'next';
import { Home } from '../_home/Home';
import { NOINDEX } from '../_site/pages';

export const metadata: Metadata = { title: 'Your desk · Ada Editor', robots: NOINDEX };

export default function Page() {
  return <Home />;
}
