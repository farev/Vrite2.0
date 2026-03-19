'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User, LogOut, Settings, LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export default function UserProfile() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();
  const { isAnonymous, showSignupModal } = useAuth();

  useEffect(() => {
    // Get initial user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleOtherDropdownOpened = (event: Event) => {
      const customEvent = event as CustomEvent<{ source?: string }>;
      if (customEvent.detail?.source !== 'profile') {
        setIsOpen(false);
      }
    };

    window.addEventListener('topbar-dropdown-opened', handleOtherDropdownOpened);
    return () => {
      window.removeEventListener('topbar-dropdown-opened', handleOtherDropdownOpened);
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse">
        <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-700"></div>
        <div className="w-24 h-4 bg-gray-300 dark:bg-gray-700 rounded"></div>
      </div>
    );
  }

  // Show Sign In button for anonymous users
  if (isAnonymous || !user) {
    return (
      <button
        onClick={() => showSignupModal('save')}
        className="flex items-center gap-2 px-4 py-2 bg-[#20a4f3] hover:bg-[#1693de] text-white rounded-lg transition-colors font-medium"
      >
        <LogIn className="w-4 h-4" />
        Sign In
      </button>
    );
  }

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const avatarUrl = user.user_metadata?.avatar_url;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          const nextOpen = !isOpen;
          setIsOpen(nextOpen);
          if (nextOpen) {
            window.dispatchEvent(
              new CustomEvent('topbar-dropdown-opened', { detail: { source: 'profile' } })
            );
          }
        }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#e9f6fe] transition-colors"
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center">
            <User className="w-5 h-5 text-white" />
          </div>
        )}
        <span className="text-sm font-medium text-[#1f2937] max-w-32 truncate">
          {displayName}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-[#d7ebf9] py-1 z-50">
          <div className="px-4 py-3 border-b border-[#e9f6fe]">
            <p className="text-sm font-medium text-gray-900 truncate">
              {displayName}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {user.email}
            </p>
          </div>

          <button
            onClick={() => {
              setIsOpen(false);
              // TODO: Navigate to settings page
            }}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-[#e9f6fe] transition-colors"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-rose-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
