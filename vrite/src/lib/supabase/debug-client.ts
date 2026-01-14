import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  console.log('[SupabaseClient] Creating browser client...');
  console.log('[SupabaseClient] SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('[SupabaseClient] ANON_KEY present:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  console.log('[SupabaseClient] Client created');
  return client;
}

// Helper function to debug session
export async function debugSession() {
  const client = createClient();
  console.log('=== [SupabaseClient] Session Debug ===');
  
  try {
    const { data: { session }, error } = await client.auth.getSession();
    
    console.log('[SupabaseClient] Session error:', error);
    console.log('[SupabaseClient] Session exists:', !!session);
    
    if (session) {
      console.log('[SupabaseClient] User ID:', session.user.id);
      console.log('[SupabaseClient] User email:', session.user.email);
      console.log('[SupabaseClient] Access token length:', session.access_token?.length || 0);
      console.log('[SupabaseClient] Access token prefix:', session.access_token?.substring(0, 20) + '...');
      console.log('[SupabaseClient] Refresh token present:', !!session.refresh_token);
      console.log('[SupabaseClient] Expires at:', session.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'N/A');
      
      // Check if token is expired
      if (session.expires_at) {
        const now = Math.floor(Date.now() / 1000);
        const isExpired = now > session.expires_at;
        console.log('[SupabaseClient] Token expired:', isExpired);
        if (isExpired) {
          console.warn('[SupabaseClient] ⚠️ Token is expired! Need to refresh.');
        }
      }
    } else {
      console.error('[SupabaseClient] ❌ No session found');
      console.log('[SupabaseClient] Checking cookies...');
      if (typeof document !== 'undefined') {
        const cookies = document.cookie.split(';').map(c => c.trim());
        const supabaseCookies = cookies.filter(c => c.includes('supabase'));
        console.log('[SupabaseClient] Supabase cookies found:', supabaseCookies.length);
        supabaseCookies.forEach(cookie => {
          const [name] = cookie.split('=');
          console.log('[SupabaseClient]   -', name);
        });
      }
    }
    
    console.log('=== [SupabaseClient] Session Debug Complete ===');
    return session;
  } catch (error) {
    console.error('[SupabaseClient] ❌ Error getting session:', error);
    throw error;
  }
}
