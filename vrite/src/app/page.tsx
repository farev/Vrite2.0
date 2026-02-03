'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { generateTempId } from '@/lib/storage';
import {
  migrateTemporaryDocuments,
  hasTemporaryDocuments,
  getTemporaryDocumentCount,
} from '@/lib/migrate-local-storage';
import {
  migrateSupabaseToCloud,
  hasSupabaseDocuments,
  getSupabaseDocumentCount,
} from '@/lib/migrate-supabase-to-cloud';
import { hasEverConnectedDrive } from '@/lib/check-drive-integration';
import DrivePermissionsToast from '@/components/DrivePermissionsToast';

const HomePage = dynamic(() => import('@/components/HomePage'), {
  ssr: false
});

const DRIVE_PERMISSION_TOAST_DISMISSED_KEY = 'vrite_drive_permission_toast_dismissed';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState('');
  const [showDriveToast, setShowDriveToast] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { showSignupModal } = useAuth();

  const handleMissingDriveToken = useCallback(async (session: any) => {
    if (typeof window === 'undefined' || !session?.user || session.user.is_anonymous) {
      return;
    }

    const provider = session.user.app_metadata?.provider;
    const providers = session.user.app_metadata?.providers;
    const isGoogleUser =
      provider === 'google' || (Array.isArray(providers) && providers.includes('google'));

    // Only handle if user signed in with Google but has no provider_token
    if (!isGoogleUser || session.provider_token) {
      return;
    }

    console.log('[Home] User has Google account but no provider token');

    // Check if user has ever successfully connected Drive before
    const hadDrivePreviously = await hasEverConnectedDrive(session.user.id);

    if (hadDrivePreviously) {
      // Token expired - auto redirect to sign in
      console.log('[Home] Drive token expired, redirecting to sign in...');

      // Save current path for return
      localStorage.setItem('oauth_return_path', window.location.pathname);

      // Redirect to sign in
      const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          scopes: 'email profile openid https://www.googleapis.com/auth/drive.file',
        },
      });

      if (error) {
        console.error('[Home] Failed to initiate OAuth:', error);
        // Fall back to showing toast
        setShowDriveToast(true);
      }
    } else {
      // User never granted Drive permissions - show toast notification
      console.log('[Home] User never granted Drive permissions, showing notification');

      // Check if user dismissed the toast before
      const dismissed = sessionStorage.getItem(DRIVE_PERMISSION_TOAST_DISMISSED_KEY);
      if (!dismissed) {
        setShowDriveToast(true);
      }
    }
  }, [supabase]);

  useEffect(() => {
    // Check authentication status (but don't redirect)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const signedIn = !!session && !session.user?.is_anonymous;
      setIsAuthenticated(signedIn);

      if (!signedIn) {
        console.log('[Home] No session - anonymous mode enabled');
        // For anonymous users, redirect to new temporary document
        const tempId = generateTempId();
        router.push(`/document/${tempId}`);
        return;
      }

      // Check for migration flag
      const needsMigrationCheck =
        typeof document !== 'undefined' &&
        document.cookie.includes('needs_migration_check=true');

      if (needsMigrationCheck) {
        // First, check for localStorage temporary documents (legacy)
        if (hasTemporaryDocuments()) {
          console.log('[Home] Migration flag detected, starting localStorage document migration...');

          const docCount = getTemporaryDocumentCount();
          console.log(`[Home] Found ${docCount} temporary documents to migrate`);

          try {
            const result = await migrateTemporaryDocuments();

            if (result.success && result.migratedCount > 0) {
              console.log(`[Home] Successfully migrated ${result.migratedCount} localStorage documents`);
            } else if (result.failedCount > 0) {
              console.error(`[Home] Migration completed with ${result.failedCount} errors`);
            }
          } catch (error) {
            console.error('[Home] LocalStorage migration error:', error);
          }
        }

        // Then, check for Supabase documents (from anonymous session)
        // Check for old anonymous user_id first (in case of OAuth sign-in with existing account)
        const anonymousUserId = typeof window !== 'undefined' ? localStorage.getItem('anonymous_user_id') : null;

        if (await hasSupabaseDocuments(anonymousUserId || undefined)) {
          console.log('[Home] Found Supabase documents, starting cloud migration...');

          const docCount = await getSupabaseDocumentCount(anonymousUserId || undefined);
          console.log(`[Home] Found ${docCount} Supabase documents to migrate to cloud`);

          // Show migration UI
          setIsMigrating(true);
          setMigrationMessage(
            docCount === 1
              ? 'Saving your document to Google Drive...'
              : `Saving ${docCount} documents to Google Drive...`
          );

          // Get the OAuth return path before migration
          const returnPath = typeof window !== 'undefined' ? localStorage.getItem('oauth_return_path') : null;

          try {
            const result = await migrateSupabaseToCloud(anonymousUserId || undefined);

            if (result.success && result.migratedCount > 0) {
              console.log(`[Home] Successfully migrated ${result.migratedCount} documents to cloud`);

              // Clear OAuth return path and anonymous user_id
              if (typeof window !== 'undefined') {
                localStorage.removeItem('oauth_return_path');
                localStorage.removeItem('anonymous_user_id');
              }

              // Turn off migration UI
              setIsMigrating(false);

              // If user was editing a specific document, redirect to the first migrated document
              // Otherwise, stay on homepage to show document list
              if (returnPath && returnPath.startsWith('/document/')) {
                const firstMigratedDoc = result.migratedDocuments[0];
                if (firstMigratedDoc) {
                  console.log('[Home] Redirecting to migrated document:', firstMigratedDoc.cloudId);
                  router.push(`/document/${firstMigratedDoc.cloudId}`);
                }
              }
            } else if (result.failedCount > 0) {
              console.error(`[Home] Cloud migration completed with ${result.failedCount} errors`);
              setIsMigrating(false);
              // Migration had errors, but user stays on homepage to see their documents
            }
          } catch (error) {
            console.error('[Home] Cloud migration error:', error);
            setIsMigrating(false);
            // Migration failed completely, user stays on homepage
          }
        } else {
          // No Supabase documents to migrate, check for OAuth return path
          if (typeof window !== 'undefined') {
            const returnPath = localStorage.getItem('oauth_return_path');
            if (returnPath && returnPath !== '/') {
              console.log('[Home] No migration needed, redirecting to return path:', returnPath);
              localStorage.removeItem('oauth_return_path');
              router.push(returnPath);
              return;
            }
          }
        }

        // Clear migration cookie after all migrations complete
        document.cookie = 'needs_migration_check=; path=/; max-age=0';
      }

      // Verify cloud storage access for authenticated users
      if (!session.provider_token) {
        console.error('[Home] ⚠️ No cloud storage access token!');
        handleMissingDriveToken(session);
      } else {
        console.log('[Home] ✅ User authenticated with cloud storage access');
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const signedIn = !!session && !session.user?.is_anonymous;
      setIsAuthenticated(signedIn);
      if (session && !session.provider_token) {
        handleMissingDriveToken(session);
      }
    });

    return () => subscription.unsubscribe();
  }, [router, supabase, handleMissingDriveToken]);

  const handleEnableDrivePermissions = () => {
    setShowDriveToast(false);
    showSignupModal('permissions-missing');
  };

  const handleDismissToast = () => {
    setShowDriveToast(false);
    // Remember that user dismissed the toast for this session
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(DRIVE_PERMISSION_TOAST_DISMISSED_KEY, 'true');
    }
  };

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

  // Show migration UI while documents are being migrated
  if (isMigrating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="text-center max-w-md px-6">
          {/* Animated icon */}
          <div className="mb-6 relative">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-indigo-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
          </div>

          {/* Message */}
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Almost there!
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {migrationMessage}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            This will only take a moment...
          </p>
        </div>
      </div>
    );
  }

  // Anonymous users are redirected to editor (handled in useEffect)
  // Authenticated users see document list
  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <HomePage />
      {showDriveToast && (
        <DrivePermissionsToast
          onEnablePermissions={handleEnableDrivePermissions}
          onDismiss={handleDismissToast}
        />
      )}
    </>
  );
}
