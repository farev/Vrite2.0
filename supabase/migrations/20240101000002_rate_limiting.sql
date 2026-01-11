-- Rate limits table
CREATE TABLE IF NOT EXISTS public.rate_limits (
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, endpoint)
);

-- Enable RLS on rate_limits table
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy to allow service role to manage rate limits
CREATE POLICY "Service role can manage rate limits" ON public.rate_limits
  FOR ALL USING (true);

-- Rate limiting function
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_endpoint TEXT,
  p_limit INTEGER,
  p_window INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  -- Get current rate limit record
  SELECT request_count, window_start INTO v_count, v_window_start
  FROM public.rate_limits
  WHERE user_id = p_user_id AND endpoint = p_endpoint;
  
  -- Reset if window expired
  IF v_window_start IS NULL OR NOW() - v_window_start > (p_window || ' seconds')::INTERVAL THEN
    INSERT INTO public.rate_limits (user_id, endpoint, request_count, window_start)
    VALUES (p_user_id, p_endpoint, 1, NOW())
    ON CONFLICT (user_id, endpoint) DO UPDATE
    SET request_count = 1, window_start = NOW();
    RETURN TRUE;
  END IF;
  
  -- Check limit
  IF v_count >= p_limit THEN
    RETURN FALSE;
  END IF;
  
  -- Increment counter
  UPDATE public.rate_limits
  SET request_count = request_count + 1
  WHERE user_id = p_user_id AND endpoint = p_endpoint;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
