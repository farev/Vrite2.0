/**
 * Anonymous Storage Abstraction
 *
 * Provides localStorage-based document storage for anonymous users
 * before they sign up. Documents are stored with a temp- prefix
 * and migrated to cloud storage after authentication.
 */

export interface TemporaryDocument {
  id: string;
  title: string;
  editorState: string;
  lastModified: number;
  createdAt: number;
}

const TEMP_DOC_PREFIX = 'vrite_temp_document_';
const CURRENT_DOC_KEY = 'vrite_temp_document_current';
const MAX_TEMP_DOCS = 3; // Keep only 3 most recent docs

/**
 * Generate a unique temporary document ID
 */
export function generateTempId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Save a document to localStorage
 * Handles quota exceeded errors and auto-cleanup
 */
export function saveTemporaryDocument(data: {
  id?: string;
  title: string;
  editorState: string;
}): string {
  try {
    const id = data.id || generateTempId();
    const now = Date.now();

    const document: TemporaryDocument = {
      id,
      title: data.title,
      editorState: data.editorState,
      lastModified: now,
      createdAt: now,
    };

    // Save to localStorage
    const key = `${TEMP_DOC_PREFIX}${id}`;
    localStorage.setItem(key, JSON.stringify(document));

    // Update current document pointer
    localStorage.setItem(CURRENT_DOC_KEY, id);

    return id;
  } catch (error) {
    // Handle quota exceeded error
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      // Auto-cleanup old documents
      cleanupOldDocuments();

      // Retry save after cleanup
      try {
        const id = data.id || generateTempId();
        const now = Date.now();

        const document: TemporaryDocument = {
          id,
          title: data.title,
          editorState: data.editorState,
          lastModified: now,
          createdAt: now,
        };

        const key = `${TEMP_DOC_PREFIX}${id}`;
        localStorage.setItem(key, JSON.stringify(document));
        localStorage.setItem(CURRENT_DOC_KEY, id);

        return id;
      } catch (retryError) {
        throw new Error('Storage quota exceeded. Please sign in to save to the cloud.');
      }
    }

    throw error;
  }
}

/**
 * Load a temporary document from localStorage
 */
export function loadTemporaryDocument(id: string): TemporaryDocument | null {
  try {
    const key = `${TEMP_DOC_PREFIX}${id}`;
    const data = localStorage.getItem(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data) as TemporaryDocument;
  } catch (error) {
    console.error('Error loading temporary document:', error);
    return null;
  }
}

/**
 * Get the current (most recently edited) temporary document ID
 */
export function getCurrentDocumentId(): string | null {
  return localStorage.getItem(CURRENT_DOC_KEY);
}

/**
 * List all temporary documents, sorted by last modified (newest first)
 */
export function listTemporaryDocuments(): TemporaryDocument[] {
  const documents: TemporaryDocument[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);

    if (key && key.startsWith(TEMP_DOC_PREFIX) && key !== CURRENT_DOC_KEY) {
      const data = localStorage.getItem(key);

      if (data) {
        try {
          const doc = JSON.parse(data) as TemporaryDocument;
          documents.push(doc);
        } catch (error) {
          console.error('Error parsing document:', error);
        }
      }
    }
  }

  // Sort by last modified (newest first)
  return documents.sort((a, b) => b.lastModified - a.lastModified);
}

/**
 * Delete a temporary document
 */
export function clearTemporaryDocument(id: string): void {
  const key = `${TEMP_DOC_PREFIX}${id}`;
  localStorage.removeItem(key);

  // Clear current doc pointer if this was the current doc
  const currentId = getCurrentDocumentId();
  if (currentId === id) {
    localStorage.removeItem(CURRENT_DOC_KEY);
  }
}

/**
 * Check if any temporary documents exist
 */
export function hasTemporaryDocuments(): boolean {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(TEMP_DOC_PREFIX) && key !== CURRENT_DOC_KEY) {
      return true;
    }
  }
  return false;
}

/**
 * Clear all temporary documents
 */
export function clearAllTemporaryDocuments(): void {
  const keys: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(TEMP_DOC_PREFIX)) {
      keys.push(key);
    }
  }

  keys.forEach(key => localStorage.removeItem(key));
}

/**
 * Auto-cleanup old documents (keep only MAX_TEMP_DOCS most recent)
 */
function cleanupOldDocuments(): void {
  const documents = listTemporaryDocuments();

  if (documents.length > MAX_TEMP_DOCS) {
    // Delete oldest documents
    const toDelete = documents.slice(MAX_TEMP_DOCS);
    toDelete.forEach(doc => clearTemporaryDocument(doc.id));
  }
}

/**
 * Get total size of temporary documents in localStorage (approximate)
 */
export function getStorageSize(): number {
  let totalSize = 0;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(TEMP_DOC_PREFIX)) {
      const data = localStorage.getItem(key);
      if (data) {
        // Approximate size in bytes (UTF-16 encoding)
        totalSize += (key.length + data.length) * 2;
      }
    }
  }

  return totalSize;
}

/**
 * Update an existing temporary document
 */
export function updateTemporaryDocument(id: string, updates: Partial<Omit<TemporaryDocument, 'id' | 'createdAt'>>): boolean {
  const existing = loadTemporaryDocument(id);

  if (!existing) {
    return false;
  }

  const updated: TemporaryDocument = {
    ...existing,
    ...updates,
    lastModified: Date.now(),
  };

  const key = `${TEMP_DOC_PREFIX}${id}`;
  localStorage.setItem(key, JSON.stringify(updated));
  localStorage.setItem(CURRENT_DOC_KEY, id);

  return true;
}
