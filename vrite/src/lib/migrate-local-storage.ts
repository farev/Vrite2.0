/**
 * Utility to migrate documents from localStorage to Supabase
 * Run this once after users log in for the first time
 */

import { createClient } from './supabase/client';

interface LegacyDocumentData {
  title: string;
  content: string;
  formatType?: string;
  lastModified: number;
  editorState?: string;
}

const LEGACY_STORAGE_KEY = 'vrite_current_document';

export interface MigrationResult {
  success: boolean;
  documentId?: string;
  error?: string;
}

/**
 * Check if there's a legacy document in localStorage
 */
export function hasLegacyDocument(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
    return stored !== null;
  } catch {
    return false;
  }
}

/**
 * Migrate document from localStorage to Supabase
 */
export async function migrateLegacyDocument(): Promise<MigrationResult> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Not in browser environment' };
  }

  try {
    // Check if user is authenticated
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return { success: false, error: 'User not authenticated' };
    }

    // Get legacy document from localStorage
    const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!stored) {
      return { success: false, error: 'No legacy document found' };
    }

    const legacyDoc: LegacyDocumentData = JSON.parse(stored);

    // Parse editor state if it exists
    let editorState: Record<string, unknown> | undefined;
    if (legacyDoc.editorState) {
      try {
        editorState = JSON.parse(legacyDoc.editorState);
      } catch {
        // If parsing fails, ignore editor state
        console.warn('Failed to parse legacy editor state');
      }
    }

    // Check if document already exists in Supabase
    const { data: existingDocs } = await supabase
      .from('documents')
      .select('id')
      .eq('title', legacyDoc.title)
      .eq('content', legacyDoc.content)
      .limit(1);

    if (existingDocs && existingDocs.length > 0) {
      // Document already migrated, just clear localStorage
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return {
        success: true,
        documentId: existingDocs[0].id,
      };
    }

    // Insert document into Supabase
    const { data: newDoc, error } = await supabase
      .from('documents')
      .insert({
        user_id: session.user.id,
        title: legacyDoc.title || 'Untitled Document',
        content: legacyDoc.content || '',
        editor_state: editorState,
        storage_provider: 'supabase',
        last_modified: new Date(legacyDoc.lastModified || Date.now()).toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Clear localStorage after successful migration
    localStorage.removeItem(LEGACY_STORAGE_KEY);

    return {
      success: true,
      documentId: newDoc.id,
    };
  } catch (error) {
    console.error('Migration error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Migrate all legacy data (can be extended for other storage keys)
 */
export async function migrateAllLegacyData(): Promise<{
  documents: MigrationResult;
  // Add other migration results here as needed
}> {
  const results = {
    documents: await migrateLegacyDocument(),
  };

  return results;
}

/**
 * Show migration prompt to user
 */
export function shouldShowMigrationPrompt(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check if migration has already been completed
  const migrationCompleted = localStorage.getItem('vrite_migration_completed');
  if (migrationCompleted === 'true') {
    return false;
  }

  // Check if there's legacy data
  return hasLegacyDocument();
}

/**
 * Mark migration as completed
 */
export function markMigrationCompleted(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('vrite_migration_completed', 'true');
}

/**
 * Reset migration status (for testing)
 */
export function resetMigrationStatus(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('vrite_migration_completed');
}
