-- Migration to allow anonymous users to access documents table
-- Anonymous users need to be able to CRUD their own documents

-- Drop existing restrictive policies on documents table
DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can insert own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;

-- Create new policies that work for both authenticated and anonymous users
-- Key change: Use auth.uid() which works for both authenticated and anonymous users

-- Allow users to view their own documents
CREATE POLICY "Users can view own documents" ON public.documents
  FOR SELECT
  USING (auth.uid() = user_id);

-- Allow users to insert documents (both authenticated and anonymous)
CREATE POLICY "Users can insert own documents" ON public.documents
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own documents
CREATE POLICY "Users can update own documents" ON public.documents
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own documents
CREATE POLICY "Users can delete own documents" ON public.documents
  FOR DELETE
  USING (auth.uid() = user_id);

-- Note: Anonymous users have a valid auth.uid() that persists across their session
-- When they upgrade to OAuth via linkIdentity(), their user_id stays the same
-- So their documents automatically stay with them after account linking
