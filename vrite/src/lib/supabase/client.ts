import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  // The @supabase/ssr package handles chunked cookies automatically
  // No custom cookie handlers needed
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
