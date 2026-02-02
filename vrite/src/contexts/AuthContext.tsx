'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

export type SignupModalTrigger =
  | 'save'
  | 'ai-success'
  | 'ai-limit-reached'
  | 'storage-full'
  | 'permissions-missing';

interface AuthContextType {
  isAuthenticated: boolean;
  isAnonymous: boolean;
  isLoading: boolean;
  sessionToken: string | null;
  userId: string | null;
  showSignupModal: (trigger: SignupModalTrigger) => void;
  hideSignupModal: () => void;
  signupModalState: {
    isOpen: boolean;
    trigger: SignupModalTrigger | null;
  };
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [signupModalState, setSignupModalState] = useState<{
    isOpen: boolean;
    trigger: SignupModalTrigger | null;
  }>({
    isOpen: false,
    trigger: null,
  });

  const supabase = createClient();

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // Treat any non-anonymous session as authenticated
        const anonymous = !!session.user.is_anonymous;
        const authenticated = !anonymous;

        setIsAuthenticated(authenticated);
        setIsAnonymous(anonymous);
        setSessionToken(session.access_token);
        setUserId(session.user.id);

        console.log('[AuthContext] Session found:', {
          authenticated,
          anonymous,
          userId: session.user.id,
        });
      } else {
        // No session - create anonymous session
        console.log('[AuthContext] No session found, creating anonymous session...');

        try {
          const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();

          if (anonError) {
            console.error('[AuthContext] Failed to create anonymous session:', anonError);
            console.error('[AuthContext] Error details:', {
              message: anonError.message,
              status: anonError.status,
              code: (anonError as any).code,
            });
            console.warn('[AuthContext] Falling back to localStorage-only mode');
            console.warn('[AuthContext] Troubleshooting steps:');
            console.warn('[AuthContext]   1. Verify anonymous sign-ins are enabled in Supabase Dashboard');
            console.warn('[AuthContext]   2. Wait 1-2 minutes for settings to propagate');
            console.warn('[AuthContext]   3. Check Supabase logs for database errors');
            console.warn('[AuthContext]   4. Verify RLS policies allow anonymous users');

            // Fall back to no session (localStorage-only mode)
            setIsAuthenticated(false);
            setIsAnonymous(false);
            setSessionToken(null);
            setUserId(null);
          } else if (anonData.session) {
            console.log('[AuthContext] Anonymous session created:', anonData.session.user.id);
            setIsAuthenticated(false);
            setIsAnonymous(true);
            setSessionToken(anonData.session.access_token);
            setUserId(anonData.session.user.id);
          } else {
            console.error('[AuthContext] No session data returned from anonymous sign-in');
            setIsAuthenticated(false);
            setIsAnonymous(false);
            setSessionToken(null);
            setUserId(null);
          }
        } catch (error) {
          console.error('[AuthContext] Exception during anonymous sign-in:', error);
          console.warn('[AuthContext] App will work in localStorage-only mode');
          setIsAuthenticated(false);
          setIsAnonymous(false);
          setSessionToken(null);
          setUserId(null);
        }
      }
    } catch (error) {
      console.error('[AuthContext] Error checking auth:', error);
      setIsAuthenticated(false);
      setIsAnonymous(false);
      setSessionToken(null);
      setUserId(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthContext] Auth state changed:', event, session?.user.id);

      if (session) {
        const anonymous = !!session.user.is_anonymous;
        const authenticated = !anonymous;

        setIsAuthenticated(authenticated);
        setIsAnonymous(anonymous);
        setSessionToken(session.access_token);
        setUserId(session.user.id);

        // Close signup modal when user signs in with OAuth
        if (authenticated) {
          hideSignupModal();
        }
      } else {
        setIsAuthenticated(false);
        setIsAnonymous(false);
        setSessionToken(null);
        setUserId(null);
      }

      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const showSignupModal = (trigger: SignupModalTrigger) => {
    // Don't show modal if already authenticated
    if (isAuthenticated) {
      return;
    }

    setSignupModalState({
      isOpen: true,
      trigger,
    });
  };

  const hideSignupModal = () => {
    setSignupModalState({
      isOpen: false,
      trigger: null,
    });
  };

  const refreshAuth = async () => {
    await checkAuth();
  };

  const value: AuthContextType = {
    isAuthenticated,
    isAnonymous,
    isLoading,
    sessionToken,
    userId,
    showSignupModal,
    hideSignupModal,
    signupModalState,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
