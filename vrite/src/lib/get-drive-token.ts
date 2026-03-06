import { createClient } from './supabase/client';

// In-memory cache to avoid calling the refresh API on every storage operation
let cache: { token: string; expiresAt: number } | null = null;

/**
 * Returns the active Google Drive access token for the current session.
 *
 * Priority:
 *  1. session.provider_token  — present immediately after OAuth login
 *  2. In-memory cache          — avoids redundant API calls within a page session
 *  3. /api/auth/refresh-drive-token — server-side exchange using stored refresh_token
 *
 * Returns null if the user is unauthenticated, anonymous, or if the refresh fails
 * (e.g. token revoked). The caller should treat null as "Drive unavailable".
 */
export async function getActiveDriveToken(): Promise<string | null> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session || session.user.is_anonymous) return null;

  // Best case: token is already in the session (first hour after login)
  if (session.provider_token) {
    cache = null; // session token takes priority; clear stale cache
    return session.provider_token;
  }

  // Use in-memory cache if still valid
  if (cache && cache.expiresAt > Date.now()) {
    return cache.token;
  }

  // Ask the server to refresh via the stored Google refresh_token
  try {
    const response = await fetch('/api/auth/refresh-drive-token');
    if (!response.ok) {
      console.warn('[DriveToken] Refresh failed with status:', response.status);
      return null;
    }
    const { accessToken } = await response.json();
    // Cache for 50 minutes (server stores with 55-min TTL; keep a small gap)
    cache = { token: accessToken, expiresAt: Date.now() + 50 * 60 * 1000 };
    return accessToken;
  } catch (error) {
    console.error('[DriveToken] Failed to reach refresh endpoint:', error);
    return null;
  }
}

/** Clear the in-memory cache (e.g. after sign-out). */
export function clearDriveTokenCache() {
  cache = null;
}
