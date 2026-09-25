import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Literal references: Next inlines NEXT_PUBLIC_* at build time only when the
// name is spelled out. The key is the publishable (browser) key; row access
// is enforced by RLS on public.documents, never by keeping this secret.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/** Cloud mode is decided by the build's env vars alone, so the server render
 *  and the browser agree (a window check here would split hydration). */
export const isCloud = Boolean(URL && KEY);

/**
 * The browser's Supabase client, or null in local mode: no env vars (CI, plain
 * `npm run dev`) or no window (prerender). Local mode is the pre-account app,
 * documents in this browser only. Created lazily — `/` is prerendered during
 * `next build`, where a module-level createClient would throw without a URL.
 */
export function getClient(): SupabaseClient | null {
  if (!URL || !KEY || typeof window === 'undefined') return null;
  client ??= createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  return client;
}
