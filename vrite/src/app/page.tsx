'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';

const HomePage = dynamic(() => import('@/components/HomePage'), { 
  ssr: false 
});

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Check authentication status
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      
      if (!session) {
        console.log('[Home] No session, redirecting to login');
        router.push('/login');
        return;
      }
      
      // Verify cloud storage access
      if (!session.provider_token) {
        console.error('[Home] ⚠️ No cloud storage access token!');
        
        // Show a user-friendly alert
        setTimeout(() => {
          const shouldReauth = confirm(
            '⚠️ Cloud Storage Access Missing\n\n' +
            'Your session does not have access to cloud storage.\n' +
            'You need to log out and log in again to grant permissions.\n\n' +
            'Click OK to log out now, or Cancel to continue (saving will not work).'
          );
          
          if (shouldReauth) {
            supabase.auth.signOut().then(() => {
              router.push('/login');
            });
          }
        }, 1000);
      } else {
        console.log('[Home] ✅ User authenticated with cloud storage access');
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      if (!session) {
        console.log('[Home] Session lost, redirecting to login');
        router.push('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [router, supabase]);

  // Show loading state while checking authentication
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  return <HomePage />;
}
