'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthState = 'loading' | 'anonymous' | 'authenticated';

// ─── Diff mock ────────────────────────────────────────────────────────────────

function DiffMock() {
  return (
    <div style={{ margin: '16px 0' }}>
      {/* Paragraph with phrase-level diff */}
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: '#0f172a', fontFamily: 'Georgia, serif' }}>
        {'Vibe '}
        <span style={{
          textDecoration: 'line-through',
          textDecorationColor: '#6b7280',
          color: '#4b5563',
          backgroundColor: 'rgba(75, 85, 99, 0.12)',
          borderRadius: 2,
          padding: '0 1px',
        }}>
          coding
        </span>
        {' '}
        <span style={{
          color: '#166534',
          fontWeight: 600,
          backgroundColor: 'rgba(22, 101, 52, 0.1)',
          borderRadius: 2,
          padding: '0 1px',
        }}>
          writing
        </span>
        {' is the future of work. Your '}
        <span style={{
          textDecoration: 'line-through',
          textDecorationColor: '#6b7280',
          color: '#4b5563',
          backgroundColor: 'rgba(75, 85, 99, 0.12)',
          borderRadius: 2,
          padding: '0 1px',
        }}>
          first draft
        </span>
        {' '}
        <span style={{
          color: '#166534',
          fontWeight: 600,
          backgroundColor: 'rgba(22, 101, 52, 0.1)',
          borderRadius: 2,
          padding: '0 1px',
        }}>
          best work
        </span>
        {' is always just one '}
        <span style={{
          textDecoration: 'line-through',
          textDecorationColor: '#6b7280',
          color: '#4b5563',
          backgroundColor: 'rgba(75, 85, 99, 0.12)',
          borderRadius: 2,
          padding: '0 1px',
        }}>
          revision
        </span>
        {' '}
        <span style={{
          color: '#166534',
          fontWeight: 600,
          backgroundColor: 'rgba(22, 101, 52, 0.1)',
          borderRadius: 2,
          padding: '0 1px',
        }}>
          vibe
        </span>
        {' away.'}
      </p>

      {/* Block-level action row */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 6,
        marginTop: 6,
        pointerEvents: 'none',
      }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 10px',
          borderRadius: 5,
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: 12,
          fontWeight: 500,
          background: '#f3f4f6',
          color: '#374151',
          border: '1px solid #d1d5db',
          cursor: 'default',
        }}>
          Reject
        </span>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 10px',
          borderRadius: 5,
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: 12,
          fontWeight: 500,
          background: '#21974e',
          color: 'white',
          border: '1px solid #21974e',
          cursor: 'default',
        }}>
          Accept
        </span>
      </div>
    </div>
  );
}

// ─── CTA section ──────────────────────────────────────────────────────────────

function CTASection({ authState, userEmail }: { authState: AuthState; userEmail: string | null }) {
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  if (authState === 'loading') {
    // Skeleton placeholder — prevents CTA flash
    return (
      <div style={{ margin: '24px 0 8px', height: 36, background: '#e5e7eb', borderRadius: 6, opacity: 0.5 }} />
    );
  }

  if (authState === 'authenticated') {
    return (
      <div style={{ margin: '24px 0 8px', fontFamily: 'Georgia, serif' }}>
        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#1f2937' }}>
          You&apos;re all set! ✓
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.6, color: '#374151' }}>
          You&apos;re signed in{userEmail ? <> as <strong>{userEmail}</strong></> : ''}. VibeWrite is designed for
          desktop — open it on your computer to start writing.
        </p>
        <button
          onClick={handleSignOut}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            fontSize: 12,
            color: '#6b7280',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontFamily: 'Arial, Helvetica, sans-serif',
          }}
        >
          Sign out
        </button>
      </div>
    );
  }

  // Default: anonymous
  return (
    <div style={{ margin: '24px 0 8px', textAlign: 'center', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <a
        href="/login"
        style={{
          display: 'block',
          width: '100%',
          padding: '10px 0',
          background: '#2563eb',
          color: 'white',
          borderRadius: 6,
          fontWeight: 600,
          fontSize: 14,
          textDecoration: 'none',
          textAlign: 'center',
          marginBottom: 12,
        }}
      >
        Get Started Free
      </a>
      <a
        href="/login"
        style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none' }}
      >
        Already have an account? Log in →
      </a>
      <p style={{ marginTop: 16, fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
        VibeWrite is designed for desktop. Open it on your computer for the full experience.
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MobileLandingPage() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setAuthState('authenticated');
        setUserEmail(data.session.user.email ?? null);
      } else {
        setAuthState('anonymous');
      }
    });
  }, []);

  return (
    <div style={{ height: '100dvh', background: '#f3f4f6', overflowY: 'auto', overflowX: 'hidden' }}>

      {/* ── Decorative menu bar ── */}
      <div style={{
        height: 48,
        background: '#f8f9fa',
        borderBottom: '1px solid #dee2e6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        {/* Logo */}
        <img
          src="/vibewrite-logo.png"
          alt="VibeWrite"
          style={{ height: 28, width: 'auto', display: 'block' }}
        />

        {/* Nav buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href="/login"
            style={{
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: 500,
              color: '#374151',
              background: 'transparent',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              textDecoration: 'none',
              fontFamily: 'var(--font-geist-sans), Arial, sans-serif',
            }}
          >
            Log In
          </a>
          <a
            href="/login"
            style={{
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: 600,
              color: 'white',
              background: '#2563eb',
              border: '1px solid #2563eb',
              borderRadius: 6,
              textDecoration: 'none',
              fontFamily: 'var(--font-geist-sans), Arial, sans-serif',
            }}
          >
            Get Started
          </a>
        </div>
      </div>

      {/* ── Editor background ── */}
      <div style={{ padding: '24px 16px 40px' }}>

        {/* ── Document page ── */}
        <div style={{
          background: 'white',
          borderRadius: 4,
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
          padding: '40px 32px',
          fontFamily: 'Georgia, serif',
          maxWidth: 600,
          margin: '0 auto',
        }}>

          {/* Title */}
          <h1 style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#1f2937',
            margin: '0 0 12px',
            fontFamily: 'Georgia, serif',
            lineHeight: 1.3,
          }}>
            VibeWrite
          </h1>

          {/* Tagline */}
          <h2 style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#1f2937',
            margin: '0 0 16px',
            fontFamily: 'Georgia, serif',
            lineHeight: 1.4,
          }}>
            Work smarter, write faster, and vibe more.
          </h2>

          {/* Intro */}
          <p style={{ fontSize: 12, lineHeight: 1.6, color: '#374151', margin: '0 0 24px' }}>
            VibeWrite is an AI-powered document editor that helps you draft, refine, and perfect your writing.
            With intelligent suggestions, cloud sync, and rich formatting, your ideas become polished prose faster
            than ever.
          </p>

          {/* AI Editing section */}
          <h2 style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#1f2937',
            margin: '0 0 10px',
            fontFamily: 'Georgia, serif',
          }}>
            AI Editing
          </h2>

          <p style={{ fontSize: 12, lineHeight: 1.6, color: '#374151', margin: '0 0 8px' }}>
            Ask the AI to improve any selection. Changes are shown inline so you can review, accept, or reject
            each edit before it&apos;s applied.
          </p>

          {/* Diff mock */}
          <DiffMock />

          {/* Features section */}
          <h2 style={{
            fontSize: 14,
            fontWeight: 700,
            color: '#1f2937',
            margin: '24px 0 10px',
            fontFamily: 'Georgia, serif',
          }}>
            Features
          </h2>

          <ul style={{
            margin: '0 0 8px',
            paddingLeft: 24,
            fontSize: 12,
            lineHeight: 1.9,
            color: '#374151',
            fontFamily: 'Georgia, serif',
            listStyleType: 'disc',
          }}>
            <li style={{ paddingLeft: 4 }}>AI writing assistant with inline diff preview</li>
            <li style={{ paddingLeft: 4 }}>AI agent with web search capability</li>
            <li style={{ paddingLeft: 4 }}>Google Drive cloud sync</li>
            <li style={{ paddingLeft: 4 }}>Rich text formatting: bold, italic, headings, lists</li>
            <li style={{ paddingLeft: 4 }}>Images and tables support</li>
            <li style={{ paddingLeft: 4 }}>Academic formatting (APA, MLA, Chicago)</li>
            <li style={{ paddingLeft: 4 }}>LaTeX equation support</li>
          </ul>

          {/* CTA */}
          <CTASection authState={authState} userEmail={userEmail} />

          {/* Footer note inside doc */}
          <p style={{
            fontSize: 11,
            color: '#9ca3af',
            margin: 0,
            textAlign: 'center',
            fontFamily: 'Georgia, serif',
          }}>
            Best experienced on desktop
          </p>

        </div>
      </div>
    </div>
  );
}
