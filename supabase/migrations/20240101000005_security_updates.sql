-- Security updates: Add SET search_path = public to existing functions
-- This migration addresses the function_search_path_mutable security warnings

-- Update update_updated_at_column function
ALTER FUNCTION update_updated_at_column() SET search_path = public;

-- Update handle_new_user function
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- Update check_rate_limit function
ALTER FUNCTION check_rate_limit(uuid, text, integer, integer) SET search_path = public;

-- Update get_secret function
ALTER FUNCTION get_secret(text) SET search_path = public;

-- Drop the overly permissive RLS policy and replace with proper policies
DROP POLICY IF EXISTS "Service role can manage rate limits" ON public.rate_limits;

-- Service role can manage all rate limits (for admin operations)
CREATE POLICY "Service role can manage rate limits" ON public.rate_limits
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Users can manage their own rate limit records
CREATE POLICY "Users can manage own rate limits" ON public.rate_limits
  FOR ALL USING (auth.uid() = user_id);