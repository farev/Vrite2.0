/**
 * Check if user has ever successfully connected Google Drive
 * Used to distinguish between expired tokens vs never granted permissions
 */

import { createClient as createBrowserClient } from './supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function hasEverConnectedDrive(userId: string, supabaseClient?: SupabaseClient): Promise<boolean> {
  const supabase = supabaseClient || createBrowserClient();

  const { data, error } = await supabase
    .from('user_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'google_drive')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[DriveIntegration] Error checking integration:', error);
    return false;
  }

  return !!data;
}

/**
 * Store successful Drive connection in user_integrations table.
 * Optionally stores OAuth tokens for silent refresh on return visits.
 */
export async function recordDriveConnection(
  userId: string,
  providerEmail?: string,
  supabaseClient?: SupabaseClient,
  tokens?: { accessToken?: string; refreshToken?: string | null; expiresAt?: Date | null }
): Promise<void> {
  const supabase = supabaseClient || createBrowserClient();

  const upsertData: Record<string, unknown> = {
    user_id: userId,
    provider: 'google_drive',
    provider_email: providerEmail,
    updated_at: new Date().toISOString(),
  };

  if (tokens?.accessToken) upsertData.access_token = tokens.accessToken;
  if (tokens?.refreshToken) upsertData.refresh_token = tokens.refreshToken;
  if (tokens?.expiresAt) upsertData.token_expires_at = tokens.expiresAt.toISOString();

  const { error } = await supabase
    .from('user_integrations')
    .upsert(upsertData, { onConflict: 'user_id,provider' });

  if (error) {
    console.error('[DriveIntegration] Error recording connection:', error);
  } else {
    console.log('[DriveIntegration] Successfully recorded Drive connection');
  }
}

/**
 * Retrieve stored Google Drive tokens for a user.
 */
export async function getStoredDriveTokens(
  userId: string,
  supabaseClient?: SupabaseClient
): Promise<{ access_token: string | null; refresh_token: string | null; token_expires_at: string | null } | null> {
  const supabase = supabaseClient || createBrowserClient();

  const { data, error } = await supabase
    .from('user_integrations')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google_drive')
    .maybeSingle();

  if (error) {
    console.error('[DriveIntegration] Error fetching tokens:', error);
    return null;
  }

  return data;
}

/**
 * Update stored Google Drive access token after a silent refresh.
 */
export async function updateDriveAccessToken(
  userId: string,
  accessToken: string,
  expiresAt: Date,
  supabaseClient?: SupabaseClient
): Promise<void> {
  const supabase = supabaseClient || createBrowserClient();

  const { error } = await supabase
    .from('user_integrations')
    .update({
      access_token: accessToken,
      token_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', 'google_drive');

  if (error) {
    console.error('[DriveIntegration] Error updating access token:', error);
  }
}
