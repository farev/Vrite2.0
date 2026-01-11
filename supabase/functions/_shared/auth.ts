import { createSupabaseClientWithAuth } from './supabase.ts';

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
  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader) {
    throw new Error('No authorization header');
  }
  
  const token = authHeader.replace('Bearer ', '');
  const supabase = createSupabaseClientWithAuth(token);
  
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    throw new Error('Unauthorized');
  }
  
  return {
    user: user as AuthUser,
    supabase,
  };
}

export async function checkRateLimit(
  userId: string,
  endpoint: string,
  supabase: ReturnType<typeof createSupabaseClientWithAuth>,
  limit = 10,
  window = 60
): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_user_id: userId,
    p_endpoint: endpoint,
    p_limit: limit,
    p_window: window,
  });
  
  if (error) {
    console.error('Rate limit check error:', error);
    return true; // Fail open in case of error
  }
  
  return data as boolean;
}
