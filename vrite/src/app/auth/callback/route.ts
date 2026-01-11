import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;

  console.log('[AuthCallback] Received OAuth code');

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      console.error('[AuthCallback] Exchange failed:', error);
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }
    
    console.log('[AuthCallback] Session established for user:', data.session?.user.email);
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${origin}/`);
}
