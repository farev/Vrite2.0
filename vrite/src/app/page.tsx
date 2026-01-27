'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { generateTempId } from '@/lib/storage';
import {
  migrateTemporaryDocuments,
  hasTemporaryDocuments,
  getTemporaryDocumentCount,
} from '@/lib/migrate-local-storage';

const HomePage = dynamic(() => import('@/components/HomePage'), {
  ssr: false
});

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Check authentication status (but don't redirect)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const authenticated = !!session?.provider_token;
      setIsAuthenticated(authenticated);

      if (!authenticated) {
        console.log('[Home] No session - anonymous mode enabled');
        // For anonymous users, redirect to new temporary document
        const tempId = generateTempId();
        router.push(`/document/${tempId}`);
        return;
      }

      // Check for migration flag and temporary documents
      const needsMigrationCheck =
        typeof document !== 'undefined' &&
        document.cookie.includes('needs_migration_check=true');

      if (needsMigrationCheck && hasTemporaryDocuments()) {
        console.log('[Home] Migration flag detected, starting document migration...');

        const docCount = getTemporaryDocumentCount();
        console.log(`[Home] Found ${docCount} temporary documents to migrate`);

        try {
          const result = await migrateTemporaryDocuments();

          if (result.success && result.migratedCount > 0) {
            console.log(`[Home] Successfully migrated ${result.migratedCount} documents`);

            // Show success message
            alert(
              `✅ Success!\n\n${result.migratedCount} document${result.migratedCount > 1 ? 's have' : ' has'} been saved to the cloud.`
            );

            // Clear migration cookie
            document.cookie = 'needs_migration_check=; path=/; max-age=0';
          } else if (result.failedCount > 0) {
            console.error(`[Home] Migration completed with ${result.failedCount} errors`);

            alert(
              `⚠️ Partial Success\n\n${result.migratedCount} documents saved, but ${result.failedCount} failed to migrate.\n\nPlease try again or contact support.`
            );
          }
        } catch (error) {
          console.error('[Home] Migration error:', error);
          alert(
            '❌ Migration Failed\n\nYour temporary documents could not be migrated. Please try logging in again.'
          );
        }
      }

      // Verify cloud storage access for authenticated users
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
      const authenticated = !!session?.provider_token;
      setIsAuthenticated(authenticated);
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

  // Anonymous users are redirected to editor (handled in useEffect)
  // Authenticated users see document list
  if (!isAuthenticated) {
    return null;
  }

  return <HomePage />;
}
