import type { Metadata } from 'next';
import { SignInScreen } from '../_auth/SignInScreen';

export const metadata: Metadata = { title: 'Create an account · Ada Editor' };

export default function Page() {
  return <SignInScreen mode="sign-up" />;
}
