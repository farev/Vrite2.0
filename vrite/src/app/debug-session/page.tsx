'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';

export default function DebugSessionPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cookies, setCookies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        console.log('=== Session Debug Page ===');
        
        // Check cookies
        const allCookies = document.cookie.split(';').map(c => c.trim());
        const supabaseCookies = allCookies.filter(c => c.includes('supabase'));
        setCookies(supabaseCookies);
        console.log('Supabase cookies:', supabaseCookies);

        // Get session
        const supabase = createClient();
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
        
        console.log('Session error:', sessionError);
        console.log('Session:', currentSession);
        
        if (sessionError) {
          setError(sessionError.message);
        } else {
          setSession(currentSession);
        }
      } catch (err) {
        console.error('Error checking session:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const testEdgeFunction = async () => {
    try {
      console.log('=== Testing Edge Function ===');
      
      const supabase = createClient();
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (!currentSession) {
        alert('No session found!');
        return;
      }

      console.log('Using access token:', currentSession.access_token.substring(0, 30) + '...');

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const endpoint = `${supabaseUrl}/functions/v1/ai-command`;

      console.log('Calling:', endpoint);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: 'Test document content',
          instruction: 'Make this bold',
        }),
      });

      console.log('Response status:', response.status);
      const responseText = await response.text();
      console.log('Response body:', responseText);

      if (!response.ok) {
        alert(`Error: ${response.status} - ${responseText}`);
      } else {
        alert('Success! Check console for details.');
      }
    } catch (err) {
      console.error('Error testing edge function:', err);
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  };

  const refreshSession = async () => {
    try {
      const supabase = createClient();
      const { data: { session: newSession }, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError) {
        alert('Refresh error: ' + refreshError.message);
      } else {
        setSession(newSession);
        alert('Session refreshed!');
      }
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading session info...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Session Debug Page</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <h2 className="text-red-800 font-semibold mb-2">Error</h2>
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Session Status</h2>
          {session ? (
            <div className="space-y-3">
              <div className="flex items-start">
                <span className="font-medium w-40">Status:</span>
                <span className="text-green-600 font-semibold">✓ Authenticated</span>
              </div>
              <div className="flex items-start">
                <span className="font-medium w-40">User ID:</span>
                <span className="font-mono text-sm">{session.user.id}</span>
              </div>
              <div className="flex items-start">
                <span className="font-medium w-40">Email:</span>
                <span>{session.user.email}</span>
              </div>
              <div className="flex items-start">
                <span className="font-medium w-40">Access Token:</span>
                <span className="font-mono text-sm break-all">
                  {session.access_token ? `${session.access_token.substring(0, 50)}...` : 'MISSING'}
                </span>
              </div>
              <div className="flex items-start">
                <span className="font-medium w-40">Token Length:</span>
                <span>{session.access_token?.length || 0} characters</span>
              </div>
              <div className="flex items-start">
                <span className="font-medium w-40">Expires At:</span>
                <span>
                  {session.expires_at 
                    ? new Date(session.expires_at * 1000).toLocaleString()
                    : 'N/A'}
                </span>
              </div>
              {session.expires_at && (
                <div className="flex items-start">
                  <span className="font-medium w-40">Expires In:</span>
                  <span>
                    {Math.floor((session.expires_at - Math.floor(Date.now() / 1000)) / 60)} minutes
                  </span>
                </div>
              )}
              <div className="flex items-start">
                <span className="font-medium w-40">Provider Token:</span>
                <span className={session.provider_token ? 'text-green-600' : 'text-red-600'}>
                  {session.provider_token ? '✓ Present' : '✗ Missing'}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-red-600 font-semibold">✗ Not authenticated</div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Cookies</h2>
          {cookies.length > 0 ? (
            <ul className="space-y-2">
              {cookies.map((cookie, index) => {
                const [name, value] = cookie.split('=');
                return (
                  <li key={index} className="font-mono text-sm">
                    <span className="font-semibold">{name}</span>
                    {value && <span className="text-gray-600"> = {value.substring(0, 50)}...</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-red-600">No Supabase cookies found!</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Actions</h2>
          <div className="space-x-4">
            <button
              onClick={testEdgeFunction}
              disabled={!session}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Test AI Command Function
            </button>
            <button
              onClick={refreshSession}
              disabled={!session}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Refresh Session
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Reload Page
            </button>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">Instructions</h3>
          <ol className="list-decimal list-inside space-y-1 text-blue-800">
            <li>Check if you have a valid session above</li>
            <li>Verify that the access token is present</li>
            <li>Check that Supabase cookies exist</li>
            <li>Click "Test AI Command Function" to test the Edge Function</li>
            <li>Check browser console (F12) for detailed logs</li>
            <li>Check Supabase Dashboard logs for server-side logs</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
