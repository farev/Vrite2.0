'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { getActiveDriveToken } from '@/lib/get-drive-token';
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
const PENDING_IMPORT_KEY = 'vrite_import_pending';
const PENDING_AI_PROMPT_KEY = 'vrite_initial_ai_prompt';
const PENDING_AI_PROMPT_MODE_KEY = 'vrite_initial_ai_prompt_mode';
const UPLOAD_IMPROVE_PROMPT =
  'Improve this document for clarity, flow, and overall quality while preserving intent and structure. If it naturally helps readability, include at least one equation or table to showcase capabilities, but do not force them.';
const HERO_ROLES = ['Engineers', 'Non-writers', 'Students', 'Makers', 'Creators'];

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState('');
  const [showDriveToast, setShowDriveToast] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isLaunchingPrompt, setIsLaunchingPrompt] = useState(false);
  const [typedRole, setTypedRole] = useState('');
  const [heroRoleIndex, setHeroRoleIndex] = useState(0);
  const [isDeletingRole, setIsDeletingRole] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { showSignupModal } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const secondaryButtonClass =
    'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md active:translate-y-0 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#21A5EF] focus-visible:ring-offset-2';
  const primaryButtonClass =
    'inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#1685CE] bg-[#21A5EF] px-5 py-3.5 text-base font-semibold text-white shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#1685CE] hover:shadow-md active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-60';

  useEffect(() => {
    const currentRole = HERO_ROLES[heroRoleIndex];
    const typingSpeed = isDeletingRole ? 55 : 95;
    const holdOnWordMs = 1300;
    let timeout: ReturnType<typeof setTimeout>;

    if (!isDeletingRole && typedRole === currentRole) {
      timeout = setTimeout(() => setIsDeletingRole(true), holdOnWordMs);
    } else if (isDeletingRole && typedRole.length === 0) {
      timeout = setTimeout(() => {
        setIsDeletingRole(false);
        setHeroRoleIndex((prev) => (prev + 1) % HERO_ROLES.length);
      }, 220);
    } else {
      timeout = setTimeout(() => {
        setTypedRole((prev) =>
          isDeletingRole
            ? currentRole.slice(0, Math.max(prev.length - 1, 0))
            : currentRole.slice(0, prev.length + 1)
        );
      }, typingSpeed);
    }

    return () => clearTimeout(timeout);
  }, [heroRoleIndex, isDeletingRole, typedRole]);

  const handleLogIn = useCallback(() => {
    router.push('/login');
  }, [router]);

  const getNewDocumentPath = useCallback(() => {
    if (isAuthenticated) {
      return '/document/new';
    }

    return `/document/${generateTempId()}`;
  }, [isAuthenticated]);

  const handleOpenFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    setIsImporting(true);

    try {
      let result: { html: string; title: string; warnings: string[] };

      if (ext === 'docx') {
        const { importDocx } = await import('@/lib/import-docx');
        result = await importDocx(file);
      } else if (ext === 'pdf') {
        const { importPdf } = await import('@/lib/import-pdf');
        result = await importPdf(file);
      } else {
        alert('Unsupported file format. Please select a .docx or .pdf file.');
        return;
      }

      if (result.warnings.length > 0) {
        console.warn('[Landing] Import warnings:', result.warnings);
      }

      if (!result.html?.trim()) {
        throw new Error('Imported file contained no usable text');
      }

      sessionStorage.setItem(
        PENDING_IMPORT_KEY,
        JSON.stringify({ html: result.html, title: result.title })
      );
      sessionStorage.setItem(PENDING_AI_PROMPT_KEY, UPLOAD_IMPROVE_PROMPT);
      sessionStorage.setItem(PENDING_AI_PROMPT_MODE_KEY, 'improve_existing');
      router.push(getNewDocumentPath());
    } catch (error) {
      console.error('[Landing] Import failed:', error);
      alert('Failed to import file. The file may be corrupted or unsupported.');
    } finally {
      event.target.value = '';
      setIsImporting(false);
    }
  }, [getNewDocumentPath, router]);

  const handleCreateFromContext = useCallback(() => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      return;
    }

    setIsLaunchingPrompt(true);
    sessionStorage.setItem(PENDING_AI_PROMPT_KEY, trimmedPrompt);
    sessionStorage.setItem(PENDING_AI_PROMPT_MODE_KEY, 'idea');
    router.push(getNewDocumentPath());
  }, [getNewDocumentPath, prompt, router]);

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
      // Token expired — try a silent refresh using the stored Google refresh_token
      console.log('[Home] Drive token expired, attempting silent refresh...');
      const refreshed = await getActiveDriveToken();
      if (refreshed) {
        console.log('[Home] Drive token refreshed silently — no redirect needed');
        return;
      }

      // Refresh failed (token revoked, credentials missing, etc.) — fall back to OAuth
      console.log('[Home] Silent refresh failed, redirecting to sign in...');
      localStorage.setItem('oauth_return_path', window.location.pathname);
      const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: { access_type: 'offline', prompt: 'consent' },
          scopes: 'email profile openid https://www.googleapis.com/auth/drive.file',
        },
      });
      if (error) {
        console.error('[Home] Failed to initiate OAuth:', error);
        setShowDriveToast(true);
      }
    } else {
      // User never granted Drive permissions — show toast notification
      console.log('[Home] User never granted Drive permissions, showing notification');
      const dismissed = sessionStorage.getItem(DRIVE_PERMISSION_TOAST_DISMISSED_KEY);
      if (!dismissed) {
        setShowDriveToast(true);
      }
    }
  }, [supabase]);

  useEffect(() => {
    // Check authentication status.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const signedIn = !!session && !session.user?.is_anonymous;
      setIsAuthenticated(signedIn);

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
        // Only migrate if there was a previous anonymous session — without an
        // anonymous_user_id there is nothing to migrate and falling back to
        // session.user.id would re-upload documents that already live in Drive.
        const anonymousUserId = typeof window !== 'undefined' ? localStorage.getItem('anonymous_user_id') : null;

        if (anonymousUserId && await hasSupabaseDocuments(anonymousUserId)) {
          console.log('[Home] Found Supabase documents, starting cloud migration...');

          const docCount = await getSupabaseDocumentCount(anonymousUserId);
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
            const result = await migrateSupabaseToCloud(anonymousUserId);

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
      if (session && !session.user?.is_anonymous) {
        if (!session.provider_token) {
          console.error('[Home] ⚠️ No cloud storage access token!');
          handleMissingDriveToken(session);
        } else {
          console.log('[Home] ✅ User authenticated with cloud storage access');
        }
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

  const handleEnableDrivePermissions = async () => {
    setShowDriveToast(false);
    const { data: { session } } = await supabase.auth.getSession();
    if (session && !session.user.is_anonymous) {
      // Authenticated user — trigger OAuth to refresh Drive token
      const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`;
      localStorage.setItem('oauth_return_path', window.location.pathname);
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: { access_type: 'offline', prompt: 'consent' },
          scopes: 'email profile openid https://www.googleapis.com/auth/drive.file',
        },
      });
    } else {
      showSignupModal('permissions-missing');
    }
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#21A5EF] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show migration UI while documents are being migrated
  if (isMigrating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-md px-6">
          {/* Animated icon */}
          <div className="mb-6 relative">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-[#21A5EF] mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-[#21A5EF]"
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

  // Authenticated users see their document list
  if (isAuthenticated) {
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

  return (
    <>
      <main className="relative min-h-screen overflow-hidden bg-white font-sans text-slate-900 antialiased">
        <div className="relative z-10 flex min-h-screen w-full flex-col">
          <div className="flex items-center justify-between px-3 pt-3 sm:px-5 sm:pt-4">
            <div className="flex items-center gap-3">
              <img
                src="/vibewrite-logo.png"
                alt="VibeWrite Logo"
                className="h-9 w-auto object-contain sm:h-11 md:h-12"
              />
            </div>
            <button
              type="button"
              onClick={handleLogIn}
              className={`${secondaryButtonClass} group`}
            >
              <span>Log in</span>
              <svg
                className="h-4 w-4 text-slate-700 transition-transform duration-200 group-hover:translate-x-0.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>

          <div className="flex flex-1 items-start justify-center px-6 pt-2 pb-8 sm:px-8 sm:pt-4">
            <div className="w-full max-w-[70rem]">
              <div className="mx-auto mb-6 max-w-3xl text-center">
                <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
                  Docs for{' '}
                  <span className="inline-block text-[#21A5EF]">
                    {typedRole}
                    <span className="ml-1 inline-block h-[0.95em] w-[2px] animate-pulse bg-[#21A5EF] align-[-0.08em]" />
                  </span>
                </h1>
              </div>

              <div className="relative">
                <div className="grid gap-5 lg:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleOpenFilePicker}
                    disabled={isImporting}
                    className="group flex min-h-[21rem] flex-col rounded-2xl border border-[#b3e0fc] bg-white p-6 text-left shadow-[0_10px_26px_rgba(15,23,42,0.08)] transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[#7ec5f8] hover:shadow-[0_18px_36px_rgba(33,165,239,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#21A5EF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div>
                      <h2 className="text-2xl font-semibold text-slate-900">
                        Upload a document
                      </h2>
                      <p className="mt-3 text-base leading-6 text-slate-600">
                        Open a `.docx` or `.pdf` and start editing right away.
                      </p>
                    </div>
                    <div className="mt-6 flex flex-1 flex-col items-center justify-center">
                      <svg
                        className="h-24 w-24 text-[#21A5EF] transition-transform duration-200 group-hover:scale-105"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 15.5V18a2 2 0 002 2h12a2 2 0 002-2v-2.5" />
                      </svg>
                      <span className="mt-4 text-sm font-medium text-slate-600">
                        {isImporting ? 'Importing document...' : 'Click anywhere to upload'}
                      </span>
                    </div>
                  </button>

                  <section className="rounded-2xl border border-[#b3e0fc] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.08)] transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[#7ec5f8] hover:shadow-[0_18px_36px_rgba(33,165,239,0.16)] sm:p-6">
                    <div className="mb-6">
                      <h2 className="text-2xl font-semibold text-slate-900">
                        Start from an idea
                      </h2>
                      <p className="mt-3 text-base leading-6 text-slate-600">
                        Type what you want to write, and Vrite will create a first draft in a new document.
                      </p>
                    </div>

                    <textarea
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      placeholder="Example: Create a one-page project proposal for an AI writing app focused on students."
                      rows={6}
                      className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-base leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#21A5EF] focus:ring-2 focus:ring-[#21A5EF]/20"
                    />

                    <button
                      type="button"
                      onClick={handleCreateFromContext}
                      disabled={!prompt.trim() || isLaunchingPrompt}
                      className={`mt-4 ${primaryButtonClass}`}
                    >
                      {isLaunchingPrompt ? 'Opening editor...' : 'Create from prompt'}
                    </button>
                  </section>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileSelected}
                className="hidden"
              />

              <p className="mt-8 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 sm:mt-10">
                Trusted by students at
              </p>
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-3 px-2 opacity-70 grayscale sm:gap-5">
                <img src="/GTlogo.png" alt="Georgia Tech" className="h-16 w-auto object-contain sm:h-20 md:h-24" />
                <img
                  src="/UFLogo.png"
                  alt="University of Florida"
                  className="h-24 w-auto object-contain sm:h-28 md:h-32"
                />
              </div>
            </div>
          </div>
        </div>
      </main>
      {showDriveToast && (
        <DrivePermissionsToast
          onEnablePermissions={handleEnableDrivePermissions}
          onDismiss={handleDismissToast}
        />
      )}
    </>
  );
}
