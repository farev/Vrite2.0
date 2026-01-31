/**
 * Supabase database storage for anonymous and authenticated users
 * Stores documents in the public.documents table
 */

import { createClient } from './supabase/client';

export interface DocumentData {
  id?: string;
  title: string;
  editorState: string;
  lastModified: number;
}

/**
 * Save document to Supabase database
 * Works for both anonymous and authenticated users
 */
export async function saveDocumentToSupabase(data: DocumentData): Promise<DocumentData> {
  console.log('[SupabaseStorage] Save initiated:', data.title);

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('No active session. Please refresh the page.');
  }

  const userId = session.user.id;
  const isAnonymous = session.user.is_anonymous || false;

  console.log('[SupabaseStorage] Saving for user:', {
    userId,
    isAnonymous,
    hasExistingId: !!data.id,
  });

  try {
    // Check if this is a valid UUID (Supabase document) or temp ID
    const isUUID = data.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id);
    const isTempId = data.id && data.id.startsWith('temp-');

    if (isUUID) {
      // Update existing Supabase document
      const { data: updatedDoc, error } = await supabase
        .from('documents')
        .update({
          title: data.title,
          editor_state: JSON.parse(data.editorState),
          last_modified: new Date().toISOString(),
        })
        .eq('id', data.id)
        .eq('user_id', userId) // Security: only update own documents
        .select()
        .single();

      if (error) {
        console.error('[SupabaseStorage] Update failed:', error);
        throw new Error(`Failed to update document: ${error.message}`);
      }

      console.log('[SupabaseStorage] Document updated:', updatedDoc.id);

      return {
        id: updatedDoc.id,
        title: updatedDoc.title,
        editorState: JSON.stringify(updatedDoc.editor_state),
        lastModified: new Date(updatedDoc.last_modified).getTime(),
      };
    } else {
      // Create new document (no ID, temp ID, or any non-UUID ID)
      console.log('[SupabaseStorage] Creating new document (replacing temp ID if present)');

      const { data: newDoc, error } = await supabase
        .from('documents')
        .insert({
          user_id: userId,
          title: data.title,
          editor_state: JSON.parse(data.editorState),
          storage_provider: 'supabase',
          last_modified: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('[SupabaseStorage] Insert failed:', error);
        throw new Error(`Failed to create document: ${error.message}`);
      }

      console.log('[SupabaseStorage] Document created with UUID:', newDoc.id);

      return {
        id: newDoc.id,
        title: newDoc.title,
        editorState: JSON.stringify(newDoc.editor_state),
        lastModified: new Date(newDoc.last_modified).getTime(),
      };
    }
  } catch (error) {
    console.error('[SupabaseStorage] Save failed:', error);
    throw error;
  }
}

/**
 * Load document by ID from Supabase
 */
export async function loadDocumentFromSupabase(documentId: string): Promise<DocumentData | null> {
  console.log('[SupabaseStorage] Loading document:', documentId);

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    console.error('[SupabaseStorage] No active session');
    return null;
  }

  try {
    const { data: doc, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', session.user.id) // Security: only load own documents
      .eq('is_deleted', false)
      .single();

    if (error) {
      console.error('[SupabaseStorage] Load failed:', error);
      return null;
    }

    if (!doc) {
      console.log('[SupabaseStorage] Document not found');
      return null;
    }

    return {
      id: doc.id,
      title: doc.title,
      editorState: JSON.stringify(doc.editor_state),
      lastModified: new Date(doc.last_modified).getTime(),
    };
  } catch (error) {
    console.error('[SupabaseStorage] Load error:', error);
    return null;
  }
}

/**
 * List all documents for current user from Supabase
 */
export async function listDocumentsFromSupabase(): Promise<DocumentData[]> {
  console.log('[SupabaseStorage] Listing documents');

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    console.error('[SupabaseStorage] No active session');
    return [];
  }

  try {
    const { data: docs, error } = await supabase
      .from('documents')
      .select('id, title, editor_state, last_modified')
      .eq('user_id', session.user.id)
      .eq('is_deleted', false)
      .order('last_modified', { ascending: false });

    if (error) {
      console.error('[SupabaseStorage] List failed:', error);
      return [];
    }

    return (docs || []).map(doc => ({
      id: doc.id,
      title: doc.title,
      editorState: '{"root":{"children":[],"direction":null,"format":"","indent":0,"type":"root","version":1}}', // Empty editor state for list view
      lastModified: new Date(doc.last_modified).getTime(),
    }));
  } catch (error) {
    console.error('[SupabaseStorage] List error:', error);
    return [];
  }
}
