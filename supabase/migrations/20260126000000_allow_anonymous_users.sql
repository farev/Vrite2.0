-- Migration to support anonymous users
-- This migration makes the email column nullable and updates the trigger
-- to handle anonymous users properly

-- Make email nullable for anonymous users
ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;

-- Update the trigger to handle anonymous users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Only insert if this is not an anonymous user, or if it is, allow NULL email
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email, -- Can be NULL for anonymous users
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- If user already exists (e.g., during account linking), skip insertion
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add a partial unique index to ensure email uniqueness only for non-NULL emails
-- This allows multiple NULL emails (for anonymous users) but ensures real emails are unique
DROP INDEX IF EXISTS idx_users_email_unique;
CREATE UNIQUE INDEX idx_users_email_unique ON public.users(email) WHERE email IS NOT NULL;
