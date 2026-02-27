'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
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

  // Stable client reference — avoids creating a new instance on every render
  const supabase = useMemo(() => createClient(), []);

  const hideSignupModal = () => {
    setSignupModalState({
      isOpen: false,
      trigger: null,
    });
  };

  const createAnonymousSession = async () => {
    console.log('[AuthContext] No session found, creating anonymous session...');
    try {
      const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();

      if (anonError) {
        console.error('[AuthContext] Failed to create anonymous session:', anonError);
        console.warn('[AuthContext] Troubleshooting steps:');
        console.warn('[AuthContext]   1. Verify anonymous sign-ins are enabled in Supabase Dashboard');
        console.warn('[AuthContext]   2. Wait 1-2 minutes for settings to propagate');
        console.warn('[AuthContext]   3. Check Supabase logs for database errors');
        console.warn('[AuthContext]   4. Verify RLS policies allow anonymous users');
        setIsAuthenticated(false);
        setIsAnonymous(false);
        setSessionToken(null);
        setUserId(null);
        setIsLoading(false);
      } else if (anonData.session) {
        console.log('[AuthContext] Anonymous session created:', anonData.session.user.id);
        // onAuthStateChange will fire and set state — no need to set here
      } else {
        console.error('[AuthContext] No session data returned from anonymous sign-in');
        setIsAuthenticated(false);
        setIsAnonymous(false);
        setSessionToken(null);
        setUserId(null);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('[AuthContext] Exception during anonymous sign-in:', error);
      setIsAuthenticated(false);
      setIsAnonymous(false);
      setSessionToken(null);
      setUserId(null);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // onAuthStateChange is the sole source of truth for session state.
    // It fires INITIAL_SESSION on mount with the current session read from cookies,
    // avoiding the race condition where getSession() + signInAnonymously() would
    // overwrite a valid OAuth session whose access token has just been refreshed.
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

        if (authenticated) {
          hideSignupModal();
        }

        setIsLoading(false);
      } else {
        setIsAuthenticated(false);
        setIsAnonymous(false);
        setSessionToken(null);
        setUserId(null);

        // Only create an anonymous session when we know for certain there is no
        // existing session (INITIAL_SESSION with null = first-ever visit, or
        // SIGNED_OUT = user explicitly signed out).
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') {
          createAnonymousSession();
        } else {
          setIsLoading(false);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const showSignupModal = (trigger: SignupModalTrigger) => {
    if (isAuthenticated) {
      return;
    }

    setSignupModalState({
      isOpen: true,
      trigger,
    });
  };

  const refreshAuth = async () => {
    // Re-fetch the current user from the server to ensure the session is fresh
    await supabase.auth.getUser();
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
