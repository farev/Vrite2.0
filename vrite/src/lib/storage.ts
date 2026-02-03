/**
 * Document storage utilities - Supports Google Drive via Supabase Auth
 * Also supports anonymous localStorage-based storage for unauthenticated users
 */

import { GoogleDriveClient } from './google-drive';
import { createClient } from './supabase/client';
import * as anonymousStorage from './storage-anonymous';
import * as supabaseStorage from './storage-supabase';

export interface DocumentData {
  id?: string;
  title: string;
  editorState: string; // Lexical editor state as JSON string (required)
  lastModified: number;
}

const AUTO_SAVE_INTERVAL = 30000; // 30 seconds in milliseconds

/**
 * Save document to cloud storage (Google Drive) or Supabase database
 * Routes to appropriate storage based on authentication type
 */
export async function saveDocument(data: DocumentData): Promise<DocumentData> {
  // Get access token from Supabase session
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    console.error('[Storage] No active session');
    throw new Error('Not authenticated');
  }

  const isAnonymous = session.user.is_anonymous || false;
  const hasProviderToken = !!session.provider_token;

  // Anonymous users or users without OAuth tokens save to Supabase database
  if (isAnonymous || !hasProviderToken) {
    return supabaseStorage.saveDocumentToSupabase(data);
  }

  // Authenticated OAuth users save to Google Drive

  const accessToken = session.provider_token;

  if (!accessToken) {
    throw new Error('No access token available');
  }

  try {
    // Use Google Drive client
    const driveClient = new GoogleDriveClient(accessToken);
    const file = await driveClient.saveDocument(data.id || null, data.title, data.editorState);

    return {
      id: file.id,
      title: file.name.replace('.vrite.json', ''), // Remove .vrite.json extension for display
      editorState: data.editorState,
      lastModified: new Date(file.modifiedTime).getTime(),
    };
  } catch (error) {
    console.error('[Storage] Save to Google Drive failed:', error);
    throw error;
  }
}

/**
 * Load most recent document from cloud storage (Google Drive)
 */
export async function loadDocument(): Promise<DocumentData | null> {
  console.log('[Storage] Loading most recent document');

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.provider_token) {
    console.error('[Storage] No session or provider token');
    return null;
  }

  try {
    // Use Google Drive client
    const driveClient = new GoogleDriveClient(session.provider_token);
    const files = await driveClient.listDocuments();

    if (files.length === 0) {
      console.log('[Storage] No documents found in Google Drive');
      return null;
    }

    const mostRecent = files[0];
    console.log('[Storage] Loading document:', mostRecent.id);
    const { editorState, metadata } = await driveClient.getDocument(mostRecent.id);

    return {
      id: metadata.id,
      title: metadata.name.replace('.vrite.json', ''), // Remove .vrite.json extension for display
      editorState,
      lastModified: new Date(metadata.modifiedTime).getTime(),
    };
  } catch (error) {
    console.error('[Storage] Load from Google Drive failed:', error);
    throw error;
  }
}

/**
 * Get formatted last modified time string
 */
export function getLastModifiedString(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  // Less than 1 minute
  if (diff < 60000) {
    return 'Just now';
  }

  // Less than 1 hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }

  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }

  // More than 24 hours - show date
  const date = new Date(timestamp);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

/**
 * Check if there's a saved document
 */
export async function hasSavedDocument(): Promise<boolean> {
  console.log('[Storage] Checking for saved documents');

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.provider_token) {
    return false;
  }

  try {
    // Use Google Drive client
    const driveClient = new GoogleDriveClient(session.provider_token);
    const files = await driveClient.listDocuments();
    return files.length > 0;
  } catch (error) {
    console.error('[Storage] Failed to check for documents:', error);
    return false;
  }
}

/**
 * List all documents from appropriate storage
 */
export async function listAllDocuments(): Promise<DocumentData[]> {
  console.log('[Storage] Listing all documents');

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    console.error('[Storage] No session');
    return [];
  }

  const isAnonymous = session.user.is_anonymous || false;
  const hasProviderToken = !!session.provider_token;

  // Anonymous users or users without OAuth use Supabase
  if (isAnonymous || !hasProviderToken) {
    console.log('[Storage] Listing from Supabase database');
    return supabaseStorage.listDocumentsFromSupabase();
  }

  // Authenticated OAuth users use cloud storage
  console.log('[Storage] Listing from Google Drive');

  if (!session.provider_token) {
    console.error('[Storage] No provider token available');
    return [];
  }

  try {
    // Use Google Drive client
    const driveClient = new GoogleDriveClient(session.provider_token);
    const files = await driveClient.listDocuments();

    return files.map(file => ({
      id: file.id,
      title: file.name.replace('.vrite.json', ''),
      editorState: '{"root":{"children":[],"direction":null,"format":"","indent":0,"type":"root","version":1}}', // Empty editor state for list view
      lastModified: new Date(file.modifiedTime).getTime(),
    }));
  } catch (error) {
    console.error('[Storage] List from Google Drive failed:', error);
    return [];
  }
}

/**
 * Load a specific document by ID from appropriate storage
 */
export async function loadDocumentById(documentId: string): Promise<DocumentData | null> {
  console.log('[Storage] Loading document by ID:', documentId);

  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    console.error('[Storage] No session');
    return null;
  }

  const isAnonymous = session.user.is_anonymous || false;
  const hasProviderToken = !!session.provider_token;

  // Check if this is a UUID (Supabase document) or cloud storage ID
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId);

  // Anonymous users, users without OAuth, or UUID documents use Supabase
  if (isAnonymous || !hasProviderToken || isUUID) {
    console.log('[Storage] Loading from Supabase database');
    return supabaseStorage.loadDocumentFromSupabase(documentId);
  }

  // Authenticated OAuth users with non-UUID IDs use cloud storage
  console.log('[Storage] Loading from Google Drive');

  if (!session.provider_token) {
    console.error('[Storage] No provider token available');
    return null;
  }

  try {
    // Use Google Drive client
    const driveClient = new GoogleDriveClient(session.provider_token);
    const { editorState, metadata } = await driveClient.getDocument(documentId);

    return {
      id: metadata.id,
      title: metadata.name.replace('.vrite.json', ''),
      editorState,
      lastModified: new Date(metadata.modifiedTime).getTime(),
    };
  } catch (error) {
    console.error('[Storage] Load from Google Drive failed:', error);
    return null;
  }
}

export { AUTO_SAVE_INTERVAL };

/**
 * Check if user is authenticated with a valid session
 */
export async function isUserAuthenticated(): Promise<boolean> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return !!session && !session.user.is_anonymous;
}

/**
 * Unified save function that routes to cloud or anonymous storage
 */
export async function saveDocumentUnified(data: DocumentData, isAuthenticated: boolean): Promise<DocumentData> {
  if (!isAuthenticated) {
    // Save to anonymous localStorage
    const id = anonymousStorage.saveTemporaryDocument({
      id: data.id,
      title: data.title,
      editorState: data.editorState,
    });

    return {
      ...data,
      id,
      lastModified: Date.now(),
    };
  }

  // Save to cloud storage
  return saveDocument(data);
}

/**
 * Unified load function that routes to cloud or anonymous storage
 */
export async function loadDocumentUnified(documentId?: string, isAuthenticated?: boolean): Promise<DocumentData | null> {
  // Auto-detect authentication if not provided
  if (isAuthenticated === undefined) {
    isAuthenticated = await isUserAuthenticated();
  }

  if (!isAuthenticated) {
    // Load from anonymous localStorage
    if (documentId && documentId.startsWith('temp-')) {
      const tempDoc = anonymousStorage.loadTemporaryDocument(documentId);
      if (tempDoc) {
        return {
          id: tempDoc.id,
          title: tempDoc.title,
          editorState: tempDoc.editorState,
          lastModified: tempDoc.lastModified,
        };
      }
    }

    // Load current document
    const currentId = anonymousStorage.getCurrentDocumentId();
    if (currentId) {
      const tempDoc = anonymousStorage.loadTemporaryDocument(currentId);
      if (tempDoc) {
        return {
          id: tempDoc.id,
          title: tempDoc.title,
          editorState: tempDoc.editorState,
          lastModified: tempDoc.lastModified,
        };
      }
    }

    return null;
  }

  // Load from cloud storage
  if (documentId) {
    return loadDocumentById(documentId);
  }

  return loadDocument();
}

/**
 * Unified list function that routes to cloud or anonymous storage
 */
export async function listDocumentsUnified(isAuthenticated: boolean): Promise<DocumentData[]> {
  if (!isAuthenticated) {
    // List from anonymous localStorage
    const tempDocs = anonymousStorage.listTemporaryDocuments();
    return tempDocs.map(doc => ({
      id: doc.id,
      title: doc.title,
      editorState: doc.editorState,
      lastModified: doc.lastModified,
    }));
  }

  // List from cloud storage
  return listAllDocuments();
}

// Re-export anonymous storage utilities for direct use when needed
export {
  saveTemporaryDocument,
  loadTemporaryDocument,
  listTemporaryDocuments,
  clearTemporaryDocument,
  hasTemporaryDocuments,
  clearAllTemporaryDocuments,
  getCurrentDocumentId,
  generateTempId,
  updateTemporaryDocument,
} from './storage-anonymous';
