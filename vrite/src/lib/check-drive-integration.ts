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
 * Store successful Drive connection in user_integrations table
 */
export async function recordDriveConnection(userId: string, providerEmail?: string, supabaseClient?: SupabaseClient): Promise<void> {
  const supabase = supabaseClient || createBrowserClient();

  const { error } = await supabase
    .from('user_integrations')
    .upsert({
      user_id: userId,
      provider: 'google_drive',
      provider_email: providerEmail,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,provider'
    });

  if (error) {
    console.error('[DriveIntegration] Error recording connection:', error);
  } else {
    console.log('[DriveIntegration] Successfully recorded Drive connection');
  }
}
