import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const returnTo = requestUrl.searchParams.get('return_to');
  const origin = requestUrl.origin;

  console.log('[AuthCallback] Received OAuth code');
  console.log('[AuthCallback] Return to:', returnTo);

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[AuthCallback] Exchange failed:', error);
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }

    console.log('[AuthCallback] Session established for user:', data.session?.user.email);

    // Check if there are temporary documents to migrate
    // Note: We can't check localStorage here (server-side), but we can set a flag
    // for the client to check and perform migration when provider_token is available
    const cookieStore = await cookies();
    cookieStore.set('needs_migration_check', 'true', {
      httpOnly: false, // Allow client-side access
      path: '/',
      maxAge: 60 * 5, // 5 minutes
      sameSite: 'lax',
    });

    console.log('[AuthCallback] Set needs_migration_check cookie for client-side migration');
  }

  // Redirect back to where the user was, or homepage if not specified
  const redirectPath = returnTo && returnTo.startsWith('/') ? returnTo : '/';
  return NextResponse.redirect(`${origin}${redirectPath}`);
}
