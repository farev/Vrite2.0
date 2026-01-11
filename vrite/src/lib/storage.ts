/**
 * Document storage utilities - Supports Google Drive and OneDrive via Supabase Auth
 */

import { GoogleDriveClient } from './google-drive';
import { OneDriveClient } from './onedrive';
import { createClient } from './supabase/client';
import type { Session } from '@supabase/supabase-js';

export interface DocumentData {
  id?: string;
  title: string;
  content: string;
  formatType?: string;
  lastModified: number;
  editorState?: string; // Lexical editor state as JSON string
}

const AUTO_SAVE_INTERVAL = 30000; // 30 seconds in milliseconds

/**
 * Detect the storage provider from the session
 */
function getProviderFromSession(session: Session): 'google' | 'azure' {
  // Check app_metadata first, then identities
  const provider = session.user.app_metadata?.provider || 
                   session.user.identities?.[0]?.provider;
  
  console.log('[Storage] Detected provider:', provider);
  
  // Return 'google' or 'azure', default to 'google' for backward compatibility
  if (provider === 'azure') {
    return 'azure';
  }
  return 'google';
}

/**
 * Get provider display name
 */
function getProviderName(provider: 'google' | 'azure'): string {
  return provider === 'azure' ? 'OneDrive' : 'Google Drive';
}

/**
 * Save document to cloud storage (Google Drive or OneDrive)
 */
export async function saveDocument(data: DocumentData): Promise<DocumentData> {
  console.log('[Storage] Save initiated:', data.title);
  
  // Get access token from Supabase session
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    console.error('[Storage] No active session');
    throw new Error('Not authenticated');
  }

  // Debug: Log full session structure
  console.log('[Storage] Session user:', session.user.email);
  console.log('[Storage] Session provider_token:', session.provider_token ? 'present' : 'missing');
  console.log('[Storage] Session provider_refresh_token:', session.provider_refresh_token ? 'present' : 'missing');
  console.log('[Storage] User app_metadata:', session.user.app_metadata);
  console.log('[Storage] User identities:', session.user.identities?.map(i => ({ provider: i.provider, id: i.id })));

  // Detect provider
  const provider = getProviderFromSession(session);
  const providerName = getProviderName(provider);

  // Get provider access token from session
  // Note: Supabase stores provider tokens in session.provider_token
  const accessToken = session.provider_token;
  if (!accessToken) {
    console.error('[Storage] No provider access token in session');
    console.error('[Storage] This usually means:');
    console.error('[Storage] 1. OAuth provider is not configured in Supabase');
    console.error('[Storage] 2. Required scopes are missing');
    console.error('[Storage] 3. User needs to log out and log in again');
    throw new Error(`${providerName} access not available. Please log out and log in again.`);
  }

  try {
    if (provider === 'azure') {
      // Use OneDrive client
      const oneDriveClient = new OneDriveClient(accessToken);
      const file = await oneDriveClient.saveDocument(data.id || null, data.title, data.content);
      
      console.log('[Storage] Document saved to OneDrive:', file.id);
      
      return {
        id: file.id,
        title: file.name.replace('.md', ''), // Remove .md extension for display
        content: data.content,
        editorState: data.editorState,
        lastModified: new Date(file.lastModifiedDateTime).getTime(),
      };
    } else {
      // Use Google Drive client
      const driveClient = new GoogleDriveClient(accessToken);
      const file = await driveClient.saveDocument(data.id || null, data.title, data.content);
      
      console.log('[Storage] Document saved to Google Drive:', file.id);
      
      return {
        id: file.id,
        title: file.name.replace('.md', ''), // Remove .md extension for display
        content: data.content,
        editorState: data.editorState,
        lastModified: new Date(file.modifiedTime).getTime(),
      };
    }
  } catch (error) {
    console.error(`[Storage] Save to ${providerName} failed:`, error);
    throw error;
  }
}

/**
 * Load most recent document from cloud storage (Google Drive or OneDrive)
 */
export async function loadDocument(): Promise<DocumentData | null> {
  console.log('[Storage] Loading most recent document');
  
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.provider_token) {
    console.error('[Storage] No session or provider token');
    return null;
  }

  // Detect provider
  const provider = getProviderFromSession(session);
  const providerName = getProviderName(provider);

  try {
    if (provider === 'azure') {
      // Use OneDrive client
      const oneDriveClient = new OneDriveClient(session.provider_token);
      const files = await oneDriveClient.listDocuments();
      
      if (files.length === 0) {
        console.log('[Storage] No documents found in OneDrive');
        return null;
      }

      const mostRecent = files[0];
      console.log('[Storage] Loading document:', mostRecent.id);
      const { content } = await oneDriveClient.getDocument(mostRecent.id);
      
      return {
        id: mostRecent.id,
        title: mostRecent.name.replace('.md', ''), // Remove .md extension for display
        content,
        lastModified: new Date(mostRecent.lastModifiedDateTime).getTime(),
      };
    } else {
      // Use Google Drive client
      const driveClient = new GoogleDriveClient(session.provider_token);
      const files = await driveClient.listDocuments();
      
      if (files.length === 0) {
        console.log('[Storage] No documents found in Google Drive');
        return null;
      }

      const mostRecent = files[0];
      console.log('[Storage] Loading document:', mostRecent.id);
      const { content } = await driveClient.getDocument(mostRecent.id);
      
      return {
        id: mostRecent.id,
        title: mostRecent.name.replace('.md', ''), // Remove .md extension for display
        content,
        lastModified: new Date(mostRecent.modifiedTime).getTime(),
      };
    }
  } catch (error) {
    console.error(`[Storage] Load from ${providerName} failed:`, error);
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

  // Detect provider
  const provider = getProviderFromSession(session);

  try {
    if (provider === 'azure') {
      // Use OneDrive client
      const oneDriveClient = new OneDriveClient(session.provider_token);
      const files = await oneDriveClient.listDocuments();
      return files.length > 0;
    } else {
      // Use Google Drive client
      const driveClient = new GoogleDriveClient(session.provider_token);
      const files = await driveClient.listDocuments();
      return files.length > 0;
    }
  } catch (error) {
    console.error('[Storage] Failed to check for documents:', error);
    return false;
  }
}

/**
 * List all documents from cloud storage
 */
export async function listAllDocuments(): Promise<DocumentData[]> {
  console.log('[Storage] Listing all documents');
  
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.provider_token) {
    console.error('[Storage] No session or provider token');
    return [];
  }

  // Detect provider
  const provider = getProviderFromSession(session);
  const providerName = getProviderName(provider);

  try {
    if (provider === 'azure') {
      // Use OneDrive client
      const oneDriveClient = new OneDriveClient(session.provider_token);
      const files = await oneDriveClient.listDocuments();
      
      return files.map(file => ({
        id: file.id,
        title: file.name.replace('.md', ''),
        content: '', // Don't load content for list view
        lastModified: new Date(file.lastModifiedDateTime).getTime(),
      }));
    } else {
      // Use Google Drive client
      const driveClient = new GoogleDriveClient(session.provider_token);
      const files = await driveClient.listDocuments();
      
      return files.map(file => ({
        id: file.id,
        title: file.name.replace('.md', ''),
        content: '', // Don't load content for list view
        lastModified: new Date(file.modifiedTime).getTime(),
      }));
    }
  } catch (error) {
    console.error(`[Storage] List from ${providerName} failed:`, error);
    return [];
  }
}

/**
 * Load a specific document by ID
 */
export async function loadDocumentById(documentId: string): Promise<DocumentData | null> {
  console.log('[Storage] Loading document by ID:', documentId);
  
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.provider_token) {
    console.error('[Storage] No session or provider token');
    return null;
  }

  // Detect provider
  const provider = getProviderFromSession(session);
  const providerName = getProviderName(provider);

  try {
    if (provider === 'azure') {
      // Use OneDrive client
      const oneDriveClient = new OneDriveClient(session.provider_token);
      const { content, metadata } = await oneDriveClient.getDocument(documentId);
      
      return {
        id: metadata.id,
        title: metadata.name.replace('.md', ''),
        content,
        lastModified: new Date(metadata.lastModifiedDateTime).getTime(),
      };
    } else {
      // Use Google Drive client
      const driveClient = new GoogleDriveClient(session.provider_token);
      const { content, metadata } = await driveClient.getDocument(documentId);
      
      return {
        id: metadata.id,
        title: metadata.name.replace('.md', ''),
        content,
        lastModified: new Date(metadata.modifiedTime).getTime(),
      };
    }
  } catch (error) {
    console.error(`[Storage] Load from ${providerName} failed:`, error);
    return null;
  }
}

export { AUTO_SAVE_INTERVAL };
