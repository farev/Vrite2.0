import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Create Supabase client with service role key
export function createSupabaseClient() {
  console.log('[Supabase] Creating service role client...');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl) {
    console.error('[Supabase] ❌ SUPABASE_URL environment variable not set');
    throw new Error('SUPABASE_URL environment variable is required');
  }
  
  if (!supabaseServiceKey) {
    console.error('[Supabase] ❌ SUPABASE_SERVICE_ROLE_KEY environment variable not set');
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  }
  
  console.log('[Supabase] ✅ Service role client created');
  console.log('[Supabase] URL:', supabaseUrl);
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Create Supabase client with user's auth token
export function createSupabaseClientWithAuth(authToken: string) {
  console.log('[Supabase] Creating authenticated client...');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  
  if (!supabaseUrl) {
    console.error('[Supabase] ❌ SUPABASE_URL environment variable not set');
    throw new Error('SUPABASE_URL environment variable is required');
  }
  
  if (!supabaseAnonKey) {
    console.error('[Supabase] ❌ SUPABASE_ANON_KEY environment variable not set');
    throw new Error('SUPABASE_ANON_KEY environment variable is required');
  }
  
  if (!authToken) {
    console.error('[Supabase] ❌ Auth token is empty or undefined');
    throw new Error('Auth token is required');
  }
  
  console.log('[Supabase] ✅ Authenticated client created');
  console.log('[Supabase] URL:', supabaseUrl);
  console.log('[Supabase] Auth token length:', authToken.length);
  
  // Create client with anon key and set the user's JWT for auth operations
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  
  return client;
}
