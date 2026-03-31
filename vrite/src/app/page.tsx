'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
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

const DRIVE_PERMISSION_TOAST_DISMISSED_KEY = 'vrite_drive_permission_toast_dismissed';
const PENDING_IMPORT_KEY = 'vrite_import_pending';
const PENDING_AI_PROMPT_KEY = 'vrite_initial_ai_prompt';
const HERO_ROLES = ['Engineers', 'Non-writers', 'Students', 'Makers', 'Creators'];
const HERO_GLOW_PATHS = [
  { d: 'M -80 620 C 210 450, 420 760, 760 560 C 980 440, 1320 720, 1600 520', duration: 17, delay: 0 },
  { d: 'M -100 240 C 240 80, 520 340, 860 180 C 1140 40, 1390 260, 1680 130', duration: 21, delay: 3 },
  { d: 'M 60 -120 C 220 180, 420 320, 560 560 C 680 760, 940 820, 1240 980', duration: 23, delay: 8 },
  { d: 'M 1500 -100 C 1300 120, 1160 260, 1080 420 C 980 640, 760 820, 430 980', duration: 20, delay: 5 },
  { d: 'M -60 820 C 260 690, 560 900, 930 820 C 1180 760, 1410 930, 1700 860', duration: 24, delay: 11 },
  { d: 'M -120 80 C 160 220, 420 -20, 760 70 C 1060 150, 1320 -40, 1660 40', duration: 19, delay: 2 },
];

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

      sessionStorage.setItem(
        PENDING_IMPORT_KEY,
        JSON.stringify({ html: result.html, title: result.title })
      );
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

  return (
    <>
      <main className="relative min-h-screen overflow-hidden bg-white text-slate-900">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(96,165,250,0.32),transparent_40%),radial-gradient(circle_at_82%_20%,rgba(37,99,235,0.22),transparent_35%),linear-gradient(180deg,#f8fbff_0%,#eff6ff_42%,#ffffff_100%)]" />
          <div className="absolute left-1/2 top-[42%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-200/55 blur-[130px]" />
          <div className="absolute left-1/2 top-[46%] h-[420px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-300/45 bg-blue-100/35 blur-3xl" />
          <svg
            className="hero-glow-lines absolute inset-0 h-full w-full"
            viewBox="0 0 1600 1000"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {HERO_GLOW_PATHS.map((path, index) => (
              <path
                key={path.d}
                d={path.d}
                className="hero-glow-path"
                style={{
                  animationDuration: `${path.duration}s`,
                  animationDelay: `${path.delay}s`,
                  opacity: 0.28 + (index % 3) * 0.12,
                }}
              />
            ))}
          </svg>
          <div className="hero-aura-streak hero-aura-streak-1" />
          <div className="hero-aura-streak hero-aura-streak-2" />
          <div className="hero-aura-streak hero-aura-streak-3" />
          <div className="hero-aura-streak hero-aura-streak-4" />
        </div>

        <div className="relative z-10 flex min-h-screen w-full flex-col">
          <div className="flex items-center justify-between px-2 pt-2 sm:px-3 sm:pt-3">
            <div className="flex items-center gap-3">
              <img src="/vibewrite-logo.png" alt="VibeWrite Logo" className="h-8 w-auto object-contain" />
            </div>
            <button
              type="button"
              onClick={handleLogIn}
              className="rounded-full border border-blue-300/55 bg-white/65 px-4 py-2 text-sm font-medium text-blue-900 backdrop-blur-md transition hover:border-blue-400 hover:bg-white/90"
            >
              Log in
            </button>
          </div>

          <div className="flex flex-1 items-start justify-center px-6 pt-2 pb-8 sm:px-8 sm:pt-4">
            <div className="w-full max-w-[70rem]">
              <div className="mx-auto mb-6 max-w-3xl text-center">
                <h1 className="text-4xl font-semibold tracking-tight text-slate-900 drop-shadow-[0_0_22px_rgba(37,99,235,0.28)] sm:text-6xl">
                  Docs for{' '}
                  <span className="inline-block min-w-[10ch] text-blue-700">
                    {typedRole}
                    <span className="ml-1 inline-block h-[0.95em] w-[2px] animate-pulse bg-blue-700 align-[-0.08em]" />
                  </span>
                </h1>
              </div>

              <div className="relative">
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-[360px] w-[122%] rounded-full border border-blue-300/60 opacity-90 [transform:rotate(-9deg)] shadow-[0_0_42px_rgba(37,99,235,0.36)]" />
                  <div className="absolute h-[300px] w-[110%] rounded-full border border-blue-300/55 opacity-80 [transform:rotate(10deg)] shadow-[0_0_36px_rgba(59,130,246,0.32)]" />
                </div>
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-[75%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-200/55 blur-[70px]" />

                <div className="relative rounded-[34px] border border-blue-200/70 bg-white/55 p-4 backdrop-blur-xl shadow-[0_22px_70px_rgba(59,130,246,0.18),inset_0_1px_0_rgba(255,255,255,0.9)] sm:p-6">
                <div className="grid gap-5 lg:grid-cols-2">
                  <section className="rounded-3xl border border-blue-100/90 bg-white/60 p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                    <div className="mb-6">
                      <p className="text-sm font-medium uppercase tracking-[0.16em] text-blue-700/75">
                        Edit a document
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold text-slate-900">
                        Import and start editing
                      </h2>
                      <p className="mt-3 text-sm leading-6 text-slate-700">
                        Bring in a `.docx` or `.pdf`, then jump straight into the editor with the imported content.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenFilePicker}
                      disabled={isImporting}
                      className="w-full rounded-2xl border border-blue-300/70 bg-blue-50/80 px-5 py-4 text-base font-medium text-blue-900 backdrop-blur-md transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isImporting ? 'Importing document...' : 'Upload a document'}
                    </button>
                  </section>

                  <section className="rounded-3xl border border-blue-100/90 bg-white/60 p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                    <div className="mb-6">
                      <p className="text-sm font-medium uppercase tracking-[0.16em] text-blue-700/75">
                        Create from context
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold text-slate-900">
                        Describe what you need
                      </h2>
                      <p className="mt-3 text-sm leading-6 text-slate-700">
                        Tell the chatbot what to draft for you, and we&apos;ll open a new document and generate it there.
                      </p>
                    </div>

                    <textarea
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      placeholder="Example: Create a one-page project proposal for an AI writing app focused on students."
                      rows={6}
                      className="w-full resize-none rounded-2xl border border-blue-200/80 bg-white/75 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white"
                    />

                    <button
                      type="button"
                      onClick={handleCreateFromContext}
                      disabled={!prompt.trim() || isLaunchingPrompt}
                      className="mt-4 w-full rounded-2xl border border-blue-300/70 bg-blue-50/80 px-5 py-4 text-base font-medium text-blue-900 backdrop-blur-md transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLaunchingPrompt ? 'Opening editor...' : 'Create from prompt'}
                    </button>
                  </section>
                </div>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileSelected}
                className="hidden"
              />
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
