-- Migration: Switch to Lexical JSON as primary storage format
-- This migration makes editor_state the required field and optionally removes content field

-- Step 1: Set a default empty editor state for any documents that don't have one
UPDATE public.documents
SET editor_state = '{"root":{"children":[],"direction":null,"format":"","indent":0,"type":"root","version":1}}'::jsonb
WHERE editor_state IS NULL;

-- Step 2: Make editor_state NOT NULL (all documents now have a value)
ALTER TABLE public.documents
ALTER COLUMN editor_state SET NOT NULL;

-- Step 3: Drop content column (optional - uncomment if you want to remove markdown storage)
-- Note: Only uncomment this if you're sure you don't need backward compatibility
-- ALTER TABLE public.documents DROP COLUMN IF EXISTS content;

-- Step 4: Update document_versions table as well
UPDATE public.document_versions
SET editor_state = '{"root":{"children":[],"direction":null,"format":"","indent":0,"type":"root","version":1}}'::jsonb
WHERE editor_state IS NULL;

ALTER TABLE public.document_versions
ALTER COLUMN editor_state SET NOT NULL;

-- Step 5: Drop content column from document_versions (optional - uncomment if needed)
-- ALTER TABLE public.document_versions DROP COLUMN IF EXISTS content;

-- Add a comment to document the change
COMMENT ON COLUMN public.documents.editor_state IS 'Lexical editor state as JSONB - primary storage format (required)';
COMMENT ON COLUMN public.document_versions.editor_state IS 'Lexical editor state as JSONB - primary storage format (required)';
