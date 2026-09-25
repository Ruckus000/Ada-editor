import type { Metadata } from 'next';
import { SignInScreen } from '../_auth/SignInScreen';

export const metadata: Metadata = { title: 'Sign in · Ada Editor' };

export default function Page() {
  return <SignInScreen />;
}
