'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Image from 'next/image';
import { X } from 'lucide-react';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [popupContent, setPopupContent] = useState<'terms' | 'privacy' | null>(null);
  const supabase = createClient();

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('[Auth] Initiating Google OAuth');
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          scopes: 'email profile openid https://www.googleapis.com/auth/drive.file',
        },
      });

      if (error) {
        console.error('[Auth] OAuth error:', error);
        throw error;
      }
    } catch (error) {
      console.error('[Auth] Google sign in error:', error);
      setError(error instanceof Error ? error.message : 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  const openPopup = (content: 'terms' | 'privacy') => {
    setPopupContent(content);
    setShowPopup(true);
  };

  const closePopup = () => {
    setShowPopup(false);
    setPopupContent(null);
  };

  const getPopupContent = () => {
    if (popupContent === 'terms') {
      return {
        title: 'Terms of Service',
        content: (
          <div className="space-y-4 text-sm">
            <p><strong>1. Acceptance of Terms</strong></p>
            <p>By accessing and using Vrite, you accept and agree to be bound by the terms and provision of this agreement.</p>

            <p><strong>2. Use License</strong></p>
            <p>Permission is granted to temporarily use Vrite for personal, non-commercial transitory viewing only.</p>

            <p><strong>3. Disclaimer</strong></p>
            <p>The materials on Vrite are provided on an 'as is' basis. Vrite makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.</p>

            <p><strong>4. Limitations</strong></p>
            <p>In no event shall Vrite or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use Vrite.</p>

            <p><strong>5. Accuracy of Materials</strong></p>
            <p>The materials appearing on Vrite could include technical, typographical, or photographic errors. Vrite does not warrant that any of the materials on its website are accurate, complete, or current.</p>
          </div>
        )
      };
    } else {
      return {
        title: 'Privacy Policy',
        content: (
          <div className="space-y-4 text-sm">
            <p><strong>1. Information We Collect</strong></p>
            <p>We collect information you provide directly to us, such as when you create an account, use our services, or contact us for support.</p>

            <p><strong>2. How We Use Your Information</strong></p>
            <p>We use the information we collect to provide, maintain, and improve our services, process transactions, and communicate with you.</p>

            <p><strong>3. Information Sharing</strong></p>
            <p>We do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except as described in this policy.</p>

            <p><strong>4. Data Security</strong></p>
            <p>We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.</p>

            <p><strong>5. Your Rights</strong></p>
            <p>You have the right to access, update, or delete your personal information. You may also opt out of certain communications.</p>

            <p><strong>6. Changes to This Policy</strong></p>
            <p>We may update this privacy policy from time to time. We will notify you of any changes by posting the new policy on this page.</p>
          </div>
        )
      };
    }
  };

  const PopupModal = () => {
    if (!showPopup || !popupContent) return null;

    const content = getPopupContent();

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {content.title}
              </h2>
              <button
                onClick={closePopup}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <div className="text-gray-700 dark:text-gray-300">
              {content.content}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={closePopup}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <PopupModal />
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
              <Image
                src="/vrite-icon.png"
                alt="Vrite Logo"
                width={64}
                height={64}
                priority
              />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Welcome to Vrite
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Your AI-powered document editor
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* OAuth Buttons */}
          <div className="space-y-4">
            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-6 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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


          </div>

          {/* Features */}
          <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div>
                <span>AI-powered document editing</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div>
                <span>Cloud storage integration</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div>
                <span>Academic formatting support</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
          By signing in, you agree to our{' '}
          <button
            onClick={() => openPopup('terms')}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 underline focus:outline-none focus:underline"
          >
            Terms of Service
          </button>
          {' '}and{' '}
          <button
            onClick={() => openPopup('privacy')}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 underline focus:outline-none focus:underline"
          >
            Privacy Policy
          </button>
        </p>
      </div>
    </div>
    </>
  );
}
