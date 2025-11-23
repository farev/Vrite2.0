/**
 * Document storage utilities using localStorage
 */

export interface DocumentData {
  title: string;
  content: string;
  formatType?: string;
  lastModified: number;
  editorState?: string; // Lexical editor state as JSON string
}

const STORAGE_KEY = 'vrite_current_document';
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds in milliseconds

/**
 * Save document to localStorage
 */
export function saveDocument(data: DocumentData): void {
  try {
    const documentWithTimestamp = {
      ...data,
      lastModified: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documentWithTimestamp));
  } catch (error) {
    console.error('Failed to save document:', error);
    // Handle quota exceeded error
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      alert('Storage quota exceeded. Please clear some space or save your document externally.');
    }
  }
}

/**
 * Load document from localStorage
 */
export function loadDocument(): DocumentData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const data = JSON.parse(stored) as DocumentData;
    return data;
  } catch (error) {
    console.error('Failed to load document:', error);
    return null;
  }
}

/**
 * Clear current document from localStorage
 */
export function clearDocument(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear document:', error);
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
export function hasSavedDocument(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export { AUTO_SAVE_INTERVAL };
