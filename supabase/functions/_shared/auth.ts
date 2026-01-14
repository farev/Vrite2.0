import { createSupabaseClient, createSupabaseClientWithAuth } from './supabase.ts';

export interface AuthUser {
  id: string;
  email?: string;
  aud: string;
  role?: string;
}

export interface AuthContext {
  user: AuthUser;
  supabase: ReturnType<typeof createSupabaseClientWithAuth>;
}

export async function verifyAuth(req: Request): Promise<AuthContext> {
  console.log('=== [Auth] Starting Authentication Verification ===');
  console.log('[Auth] Request URL:', req.url);
  console.log('[Auth] Request method:', req.method);
  
  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    console.error('[Auth] ❌ CRITICAL: No authorization header found in request');
    console.error('[Auth] Available headers:', JSON.stringify(Object.fromEntries(req.headers.entries())));
    throw new Error('No authorization header - please ensure you are logged in and the Authorization header is being sent');
  }

  console.log('[Auth] ✅ Authorization header present');
  
  // Robust token extraction
  let token = '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.substring(7).trim();
    console.log('[Auth] Token extracted using Bearer prefix');
  } else {
    token = authHeader.trim();
    console.log('[Auth] Token extracted by trimming whitespace (no Bearer prefix found)');
  }

  if (!token) {
    console.error('[Auth] ❌ CRITICAL: Extracted token is empty');
    throw new Error('Authorization token is empty');
  }

  console.log('[Auth] Token extracted successfully');
  console.log('[Auth] Token length:', token.length);
  console.log('[Auth] Token prefix (first 20 chars):', token.substring(0, 20) + '...');
  
  // Basic JWT format check and payload extraction for debugging
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.error('[Auth] ❌ CRITICAL: Token does not appear to be a valid JWT (should have 3 parts)');
    console.error('[Auth]   - Parts found:', parts.length);
    throw new Error('Invalid JWT format - token should have 3 parts separated by dots');
  }

  try {
    // Log the payload (unverified) for debugging project mismatch issues
    const payloadPart = parts[1];
    const decodedPayload = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')));
    console.log('[Auth] 🔍 JWT Payload (unverified):');
    console.log('  - sub (User ID):', decodedPayload.sub);
    console.log('  - email:', decodedPayload.email);
    console.log('  - iss (Issuer):', decodedPayload.iss);
    console.log('  - aud (Audience):', decodedPayload.aud);
    console.log('  - exp (Expires):', new Date(decodedPayload.exp * 1000).toISOString());
    
    const now = Math.floor(Date.now() / 1000);
    if (decodedPayload.exp < now) {
      console.warn('[Auth] ⚠️ Token is ALREADY EXPIRED according to payload!');
      console.warn('  - Current time:', new Date(now * 1000).toISOString());
    }
  } catch (e) {
    console.warn('[Auth] ⚠️ Could not parse unverified JWT payload:', e.message);
  }

  try {
    // Use service role client to verify the JWT
    const serviceClient = createSupabaseClient();
    console.log('[Auth] Service role client created for JWT verification');

    console.log('[Auth] Calling supabase.auth.getUser() with JWT...');
    const { data: { user }, error } = await serviceClient.auth.getUser(token);
    
    console.log('[Auth] getUser() completed');
    
    if (error) {
      console.error('[Auth] ❌ getUser() error details:');
      console.error('[Auth]   - Error message:', error.message);
      console.error('[Auth]   - Error name:', error.name);
      console.error('[Auth]   - Error status:', (error as any).status);
      
      // Check if it's a project mismatch or signature error
      if (error.message.includes('invalid') || error.message.includes('signature')) {
        console.error('[Auth] 💡 This often means the JWT_SECRET in the Edge Function doesn\'t match the one that signed the token.');
      }
      
      throw new Error(`Unauthorized: ${error.message}`);
    }

    if (!user) {
      console.error('[Auth] ❌ No user returned from getUser()');
      throw new Error('Unauthorized: User not found');
    }

    console.log('[Auth] ✅ Authentication successful!');
    console.log('[Auth] User ID:', user.id);
    console.log('[Auth] User email:', user.email);
    console.log('[Auth] User role:', user.role);
    console.log('[Auth] User aud:', user.aud);
    console.log('=== [Auth] Authentication Verification Complete ===');
    
    // Create user-scoped client for subsequent operations
    const userClient = createSupabaseClientWithAuth(token);
    
    return {
      user: user as AuthUser,
      supabase: userClient,
    };
  } catch (error) {
    console.error('=== [Auth] Authentication Verification FAILED ===');
    console.error('[Auth] ❌ Exception during auth:', error);
    throw error;
  }
}

export async function checkRateLimit(
  userId: string,
  endpoint: string,
  supabase: ReturnType<typeof createSupabaseClientWithAuth>,
  limit = 10,
  window = 60
): Promise<boolean> {
  console.log('[RateLimit] Checking rate limit for user:', userId);
  console.log('[RateLimit] Endpoint:', endpoint, 'Limit:', limit, 'Window:', window);
  
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_user_id: userId,
      p_endpoint: endpoint,
      p_limit: limit,
      p_window: window,
    });
    
    if (error) {
      console.error('[RateLimit] ⚠️ Rate limit check error:', error.message);
      console.error('[RateLimit] Error details:', JSON.stringify(error, null, 2));
      console.warn('[RateLimit] Failing open (allowing request) due to error');
      return true; // Fail open in case of error
    }
    
    console.log('[RateLimit] Rate limit check result:', data ? 'ALLOWED' : 'BLOCKED');
    return data as boolean;
  } catch (error) {
    console.error('[RateLimit] ❌ Exception during rate limit check:', error);
    console.warn('[RateLimit] Failing open (allowing request) due to exception');
    return true;
  }
}
