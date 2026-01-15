'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function DebugJWTPage() {
  const [output, setOutput] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const log = (message: string) => {
    setOutput(prev => prev + message + '\n');
    console.log(message);
  };

  const testAuth = async () => {
    setOutput('');
    setLoading(true);

    try {
      log('=== JWT AUTHENTICATION TEST ===\n');

      // Step 1: Get session
      log('1. Getting current session...');
      const supabase = createClient();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        log(`❌ Error getting session: ${sessionError.message}`);
        return;
      }

      if (!session) {
        log('❌ No session found! Please log in first.');
        log('   Go to the home page and log in with Google.');
        return;
      }

      log(`✅ Session found for: ${session.user.email}`);
      log(`   User ID: ${session.user.id}`);
      log(`   Token type: ${session.token_type}`);
      log(`   Access token (first 30 chars): ${session.access_token.substring(0, 30)}...`);
      log(`   Token length: ${session.access_token.length} characters`);
      
      // Check expiry
      const expiresAt = new Date(session.expires_at! * 1000);
      const now = new Date();
      const expiresIn = session.expires_at! - Date.now() / 1000;
      const expiresInMinutes = Math.floor(expiresIn / 60);
      
      log(`   Expires at: ${expiresAt.toLocaleString()}`);
      log(`   Current time: ${now.toLocaleString()}`);
      log(`   Expires in: ${expiresInMinutes} minutes (${Math.floor(expiresIn)} seconds)`);
      
      if (expiresIn < 0) {
        log('⚠️  WARNING: Token is EXPIRED!');
        log('   Solution: Log out and log back in, or refresh the session.');
      } else if (expiresIn < 300) {
        log('⚠️  WARNING: Token expires soon (less than 5 minutes)');
      } else {
        log('✅ Token is valid and not expired');
      }

      // Step 2: Validate token with Supabase
      log('\n2. Validating token with Supabase...');
      const { data: { user }, error: userError } = await supabase.auth.getUser(session.access_token);

      if (userError) {
        log(`❌ Token validation FAILED!`);
        log(`   Error: ${userError.message}`);
        log(`   Status: ${(userError as any).status || 'N/A'}`);
        log(`   This is the same error the Edge Function is seeing!`);
        log('\n   SOLUTION: Try one of these:');
        log('   1. Log out and log back in');
        log('   2. Clear browser storage (DevTools > Application > Clear site data)');
        log('   3. Refresh the session (see button below)');
        return;
      }

      log(`✅ Token validation SUCCESSFUL!`);
      if (!user) {
        log(`❌ Unexpected error: User is null despite successful validation`);
        return;
      }
      log(`   User: ${user.email}`);
      log(`   User ID: ${user.id}`);
      log(`   Role: ${user.role || 'N/A'}`);

      // Step 3: Test Edge Function
      log('\n3. Testing ai-command Edge Function...');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const endpoint = `${supabaseUrl}/functions/v1/ai-command`;
      
      log(`   Endpoint: ${endpoint}`);
      log(`   Sending POST request...`);

      const startTime = Date.now();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: 'Test document content for JWT validation',
          instruction: 'Make the word "Test" bold',
        }),
      });
      const endTime = Date.now();

      log(`   Response received in ${endTime - startTime}ms`);
      log(`   Status: ${response.status} ${response.statusText}`);
      
      const responseText = await response.text();
      log(`   Response body length: ${responseText.length} characters`);

      if (response.ok) {
        log('✅ Edge Function call SUCCESSFUL!');
        try {
          const data = JSON.parse(responseText);
          log(`   Response type: ${data.type}`);
          log(`   Changes count: ${data.changes?.length || 0}`);
          log(`   Summary: ${data.summary?.substring(0, 100) || 'N/A'}`);
        } catch {
          log(`   Response (first 200 chars): ${responseText.substring(0, 200)}`);
        }
      } else {
        log('❌ Edge Function call FAILED!');
        log(`   Response: ${responseText}`);
        
        if (response.status === 401) {
          log('\n   This is an authentication error!');
          log('   The Edge Function rejected your JWT token.');
          log('\n   SOLUTION: Try one of these:');
          log('   1. Log out and log back in');
          log('   2. Refresh the session (see button below)');
          log('   3. Check Supabase Edge Function logs for details');
        }
      }

      log('\n=== TEST COMPLETE ===');

    } catch (err) {
      log(`\n❌ EXCEPTION: ${err instanceof Error ? err.message : 'Unknown error'}`);
      if (err instanceof Error && err.stack) {
        log(`   Stack: ${err.stack}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshSession = async () => {
    setOutput('');
    setLoading(true);

    try {
      log('=== REFRESHING SESSION ===\n');
      
      const supabase = createClient();
      log('Calling supabase.auth.refreshSession()...');
      
      const { data: { session }, error } = await supabase.auth.refreshSession();

      if (error) {
        log(`❌ Refresh FAILED: ${error.message}`);
        log('   You may need to log out and log back in.');
        return;
      }

      if (!session) {
        log('❌ No session returned after refresh');
        log('   Please log out and log back in.');
        return;
      }

      log('✅ Session refreshed successfully!');
      log(`   User: ${session.user.email}`);
      log(`   New token (first 30 chars): ${session.access_token.substring(0, 30)}...`);
      
      const expiresAt = new Date(session.expires_at! * 1000);
      const expiresIn = session.expires_at! - Date.now() / 1000;
      log(`   New expiry: ${expiresAt.toLocaleString()}`);
      log(`   Valid for: ${Math.floor(expiresIn / 60)} minutes`);
      
      log('\nNow try the "Test Authentication" button again!');

    } catch (err) {
      log(`\n❌ EXCEPTION: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const clearStorage = () => {
    if (confirm('This will clear all site data and log you out. Continue?')) {
      localStorage.clear();
      sessionStorage.clear();
      alert('Storage cleared! Please refresh the page and log in again.');
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'monospace' }}>
      <h1 style={{ marginBottom: '1rem' }}>JWT Authentication Debugger</h1>
      
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        This page helps you diagnose JWT authentication issues with the ai-command Edge Function.
      </p>

      <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={testAuth}
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            backgroundColor: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Testing...' : 'Test Authentication'}
        </button>

        <button
          onClick={refreshSession}
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          Refresh Session
        </button>

        <button
          onClick={clearStorage}
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          Clear Storage & Logout
        </button>
      </div>

      <div
        style={{
          backgroundColor: '#1e1e1e',
          color: '#d4d4d4',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          minHeight: '400px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: '0.875rem',
          lineHeight: '1.5',
          overflowX: 'auto',
        }}
      >
        {output || 'Click "Test Authentication" to begin...'}
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f3f4f6', borderRadius: '0.5rem' }}>
        <h2 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>Quick Fixes</h2>
        <ul style={{ marginLeft: '1.5rem', lineHeight: '1.8' }}>
          <li><strong>Invalid JWT error?</strong> Try "Refresh Session" button above</li>
          <li><strong>Still not working?</strong> Try "Clear Storage & Logout", then log in again</li>
          <li><strong>Token expired?</strong> Log out and log back in</li>
          <li><strong>Need more help?</strong> Check the JWT_DEBUGGING_GUIDE.md file</li>
        </ul>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#fef3c7', borderRadius: '0.5rem' }}>
        <h2 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>What This Tests</h2>
        <ol style={{ marginLeft: '1.5rem', lineHeight: '1.8' }}>
          <li>Checks if you have an active Supabase session</li>
          <li>Validates your JWT token with Supabase auth</li>
          <li>Tests the actual ai-command Edge Function call</li>
          <li>Shows detailed error messages if anything fails</li>
        </ol>
      </div>

      <div style={{ marginTop: '2rem', textAlign: 'center', color: '#666' }}>
        <a href="/" style={{ color: '#0070f3', textDecoration: 'underline' }}>
          ← Back to Home
        </a>
      </div>
    </div>
  );
}
