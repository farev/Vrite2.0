'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth, type SignupModalTrigger } from '@/contexts/AuthContext';
import { X } from 'lucide-react';
import Image from 'next/image';

const TRIGGER_MESSAGES: Record<SignupModalTrigger, { title: string; description: string }> = {
  save: {
    title: 'Save your work to the cloud',
    description: 'Sign in to save your document permanently and access it from anywhere.',
  },
  'ai-success': {
    title: 'Keep your AI-enhanced document',
    description: 'Sign in to save your AI-powered edits and unlock unlimited AI assistance.',
  },
  'ai-limit-reached': {
    title: 'Unlock unlimited AI assistance',
    description: 'You\'ve reached the limit for anonymous AI usage. Sign in for unlimited access.',
  },
  'storage-full': {
    title: 'Storage limit reached',
    description: 'Your browser storage is full. Sign in to save unlimited documents to the cloud.',
  },
};

export default function SignupModal() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signupModalState, hideSignupModal, isAnonymous } = useAuth();
  const supabase = createClient();

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);

      // Save current page URL to localStorage to redirect back after OAuth
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';
      if (typeof window !== 'undefined') {
        localStorage.setItem('oauth_return_path', currentPath);
        console.log('[SignupModal] Saved return path to localStorage:', currentPath);
      }

      // Save current anonymous user_id if exists (for document migration)
      if (isAnonymous && typeof window !== 'undefined') {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          localStorage.setItem('anonymous_user_id', session.user.id);
          console.log('[SignupModal] Saved anonymous user_id for migration:', session.user.id);
        }
      }

      const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`;

      // Always use regular OAuth sign-in (avoid linkIdentity to prevent identity_already_exists errors)
      console.log('[SignupModal] Initiating Google OAuth');
      console.log('[SignupModal] redirectTo:', redirectUrl);

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
        console.error('[SignupModal] OAuth error:', error);
        throw error;
      }
    } catch (error) {
      console.error('[SignupModal] Google sign in error:', error);
      setError(error instanceof Error ? error.message : 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  if (!signupModalState.isOpen || !signupModalState.trigger) {
    return null;
  }

  const message = TRIGGER_MESSAGES[signupModalState.trigger];

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={hideSignupModal}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-8 relative animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={hideSignupModal}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          aria-label="Close modal"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16">
            <Image
              src="/vrite-icon.png"
              alt="Vrite Logo"
              width={64}
              height={64}
              priority
            />
          </div>
        </div>

        {/* Title and Description */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {message.title}
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {message.description}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Sign In Button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {loading ? 'Signing in...' : 'Continue with Google'}
        </button>

        {/* Continue without signing in */}
        <button
          onClick={hideSignupModal}
          className="w-full mt-4 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          Continue editing without signing in
        </button>

        {/* Features */}
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div>
              <span>Unlimited AI assistance</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div>
              <span>Cloud storage and sync</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div>
              <span>Access from anywhere</span>
            </div>
          </div>
        </div>

        {/* Terms */}
        <p className="text-center text-xs text-gray-500 dark:text-gray-500 mt-6">
          By signing in, you agree to our{' '}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Terms
          </a>
          {' '}and{' '}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}
