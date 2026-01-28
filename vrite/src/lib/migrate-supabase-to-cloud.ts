/**
 * Migrate documents from Supabase database to cloud storage (Google Drive/OneDrive)
 * Used when anonymous users sign in with OAuth
 */

import { createClient } from './supabase/client';
import { saveDocument } from './storage';
import type { DocumentData } from './storage';

export interface SupabaseMigrationResult {
  success: boolean;
  migratedCount: number;
  failedCount: number;
  migratedDocuments: Array<{ supabaseId: string; cloudId: string; title: string }>;
  errors: Array<{ supabaseId: string; error: string }>;
}

/**
 * Check if user has documents in Supabase database
 * Optionally check for documents from a specific user_id (e.g., old anonymous session)
 */
export async function hasSupabaseDocuments(userId?: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) return false;

    // Use provided userId or current session user_id
    const targetUserId = userId || session.user.id;

    const { data: docs, error } = await supabase
      .from('documents')
      .select('id')
      .eq('user_id', targetUserId)
      .eq('is_deleted', false)
      .limit(1);

    if (error) {
      console.error('[Migration] Error checking Supabase documents:', error);
      return false;
    }

    return (docs && docs.length > 0) || false;
  } catch (error) {
    console.error('[Migration] Exception checking Supabase documents:', error);
    return false;
  }
}

/**
 * Get count of documents in Supabase
 * Optionally count documents from a specific user_id (e.g., old anonymous session)
 */
export async function getSupabaseDocumentCount(userId?: string): Promise<number> {
  if (typeof window === 'undefined') return 0;

  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) return 0;

    // Use provided userId or current session user_id
    const targetUserId = userId || session.user.id;

    const { data: docs, error } = await supabase
      .from('documents')
      .select('id')
      .eq('user_id', targetUserId)
      .eq('is_deleted', false);

    if (error) {
      console.error('[Migration] Error counting Supabase documents:', error);
      return 0;
    }

    return docs?.length || 0;
  } catch (error) {
    console.error('[Migration] Exception counting Supabase documents:', error);
    return 0;
  }
}

/**
 * Migrate all documents from Supabase to cloud storage (Google Drive/OneDrive)
 * Optionally migrate documents from a specific user_id (e.g., old anonymous session)
 */
export async function migrateSupabaseToCloud(userId?: string): Promise<SupabaseMigrationResult> {
  console.log('[Migration] Starting Supabase -> Cloud migration');

  const result: SupabaseMigrationResult = {
    success: true,
    migratedCount: 0,
    failedCount: 0,
    migratedDocuments: [],
    errors: [],
  };

  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.provider_token) {
      result.success = false;
      result.errors.push({
        supabaseId: 'n/a',
        error: 'No OAuth provider token - cannot save to cloud storage',
      });
      return result;
    }

    // Use provided userId or current session user_id
    const targetUserId = userId || session.user.id;

    console.log('[Migration] Fetching documents from Supabase...');
    if (userId) {
      console.log(`[Migration] Migrating documents from anonymous user: ${userId}`);
    }

    // Get all documents from Supabase
    const { data: docs, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', targetUserId)
      .eq('is_deleted', false)
      .order('last_modified', { ascending: false});

    if (fetchError) {
      console.error('[Migration] Failed to fetch documents:', fetchError);
      result.success = false;
      result.errors.push({
        supabaseId: 'n/a',
        error: `Failed to fetch documents: ${fetchError.message}`,
      });
      return result;
    }

    if (!docs || docs.length === 0) {
      console.log('[Migration] No documents to migrate');
      return result;
    }

    console.log(`[Migration] Found ${docs.length} documents to migrate`);

    // Migrate each document
    for (const doc of docs) {
      try {
        console.log(`[Migration] Migrating: ${doc.title} (${doc.id})`);

        const documentData: DocumentData = {
          title: doc.title || 'Untitled Document',
          content: doc.content || '',
          editorState: doc.editor_state ? JSON.stringify(doc.editor_state) : undefined,
          lastModified: new Date(doc.last_modified).getTime(),
        };

        // Save to cloud storage (Google Drive/OneDrive)
        const cloudDoc = await saveDocument(documentData);

        console.log(`[Migration] Successfully migrated ${doc.id} -> ${cloudDoc.id}`);

        result.migratedDocuments.push({
          supabaseId: doc.id,
          cloudId: cloudDoc.id!,
          title: doc.title,
        });
        result.migratedCount++;

        // Delete from Supabase (hard delete - permanently remove)
        const { error: deleteError } = await supabase
          .from('documents')
          .delete()
          .eq('id', doc.id);

        if (deleteError) {
          console.warn(`[Migration] Failed to delete Supabase doc ${doc.id}:`, deleteError);
          // Don't fail migration if delete fails - document is already in Drive
        } else {
          console.log(`[Migration] Permanently deleted Supabase doc ${doc.id}`);
        }
      } catch (error) {
        console.error(`[Migration] Failed to migrate document ${doc.id}:`, error);

        result.errors.push({
          supabaseId: doc.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        result.failedCount++;
        result.success = false;
      }
    }

    console.log(`[Migration] Completed: ${result.migratedCount} succeeded, ${result.failedCount} failed`);

    return result;
  } catch (error) {
    console.error('[Migration] Migration process error:', error);
    result.success = false;
    result.errors.push({
      supabaseId: 'n/a',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return result;
  }
}
