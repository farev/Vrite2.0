import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStoredDriveTokens, updateDriveAccessToken } from '@/lib/check-drive-integration';

// Google access tokens expire in 1 hour; refresh with a 5-minute safety buffer
const GOOGLE_TOKEN_TTL_MS = 55 * 60 * 1000;

export async function GET() {
  // 1. Verify authenticated session
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Load stored refresh token
  const tokens = await getStoredDriveTokens(user.id, supabase);

  if (!tokens?.refresh_token) {
    return NextResponse.json({ error: 'No refresh token stored' }, { status: 404 });
  }

  // 3. Return cached access token if still valid
  if (tokens.access_token && tokens.token_expires_at) {
    const expiresAt = new Date(tokens.token_expires_at).getTime();
    if (expiresAt > Date.now()) {
      return NextResponse.json({ accessToken: tokens.access_token });
    }
  }

  // 4. Exchange refresh token for new access token
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[RefreshDriveToken] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.json().catch(() => ({}));
    console.error('[RefreshDriveToken] Google token refresh failed:', errorBody);
    // invalid_grant means the refresh token was revoked — user must re-authenticate
    return NextResponse.json({ error: 'Token refresh failed', detail: errorBody }, { status: 401 });
  }

  const tokenData = await tokenResponse.json();
  const newAccessToken: string = tokenData.access_token;
  const expiresIn: number = tokenData.expires_in ?? 3600;
  const expiresAt = new Date(Date.now() + Math.min(expiresIn * 1000, GOOGLE_TOKEN_TTL_MS));

  // 5. Persist the new access token
  await updateDriveAccessToken(user.id, newAccessToken, expiresAt, supabase);

  console.log('[RefreshDriveToken] Successfully refreshed Drive token for user:', user.id);
  return NextResponse.json({ accessToken: newAccessToken });
}
