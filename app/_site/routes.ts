import { isCloud } from '../_data/supabase';

/**
 * Where things live, for the whole app. Nothing here imports a screen or a
 * stylesheet, so AuthGate, the editor and the pre-paint script can share it
 * without pulling the public pages' header into every route.
 */

/** The signed-in home: every document, ranked by what stops it being published. */
export const DESK = '/desk';

/** Where the public pages' calls to action go: creating an account when there
 *  are accounts (a signed-in visitor is sent on to the desk), the desk in local mode. */
export const START = isCloud ? '/sign-up' : DESK;

/** The screens that need an account. AuthGate asks for one here and nowhere
 *  else, so the public pages and "Page not found" render for anyone. A new
 *  private route belongs here and in next.config.ts's noindex headers. */
export const isAppPath = (path: string) => path === DESK || path.startsWith('/editor/');
