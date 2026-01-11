-- Function to retrieve secrets from Supabase Vault
-- This function will be used by Edge Functions to access the OpenAI API key
CREATE OR REPLACE FUNCTION get_secret(secret_name TEXT)
RETURNS TEXT AS $$
  SELECT decrypted_secret 
  FROM vault.decrypted_secrets 
  WHERE name = secret_name
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Grant execute permission to authenticated users (will be called by Edge Functions)
GRANT EXECUTE ON FUNCTION get_secret(TEXT) TO service_role;

-- Note: To store secrets, run this SQL in the Supabase dashboard with service role key:
-- SELECT vault.create_secret('your-openai-api-key', 'openai_api_key');
