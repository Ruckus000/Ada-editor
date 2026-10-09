import type { Metadata } from 'next';
import { SignInScreen } from '../_auth/SignInScreen';
import { NOINDEX } from '../_site/pages';

export const metadata: Metadata = { title: 'Sign in · Ada Editor', robots: NOINDEX };

export default function Page() {
  return <SignInScreen />;
}
