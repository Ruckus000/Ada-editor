import type { Metadata } from 'next';
import { Home } from '../_home/Home';

export const metadata: Metadata = { title: 'Your desk · Ada Editor' };

export default function Page() {
  return <Home />;
}
