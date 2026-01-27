import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  console.log('[Middleware] Request:', request.nextUrl.pathname);
  
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshing the auth token
  const { data: { user } } = await supabase.auth.getUser();

  // Define anonymous-accessible routes
  const pathname = request.nextUrl.pathname;
  const anonymousRoutes = [
    '/',
    '/login',
    '/auth/callback',
    '/document/new',
  ];

  // Check if route is anonymous-accessible or a temporary document
  const isAnonymousRoute =
    anonymousRoutes.includes(pathname) ||
    pathname.startsWith('/document/temp-') ||
    pathname.startsWith('/api/ai-anonymous');

  // Redirect to login only for protected routes
  if (!user && !isAnonymousRoute) {
    console.log('[Middleware] No user session, redirecting to login from:', pathname);
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return supabaseResponse;
}
