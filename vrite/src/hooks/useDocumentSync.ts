/**
 * Multi-tab Document Sync Hook
 *
 * Handles synchronization of temporary documents across multiple browser tabs.
 * Detects when the same document is modified in another tab and prompts the user.
 */

import { useEffect, useRef, useCallback } from 'react';
import { loadTemporaryDocument } from '@/lib/storage';

interface UseDocumentSyncOptions {
  documentId: string | undefined;
  isAuthenticated: boolean;
  onDocumentUpdated?: (newContent: string, newTitle: string) => void;
  onConflictDetected?: () => void;
}

export function useDocumentSync({
  documentId,
  isAuthenticated,
  onDocumentUpdated,
  onConflictDetected,
}: UseDocumentSyncOptions) {
  const lastKnownTimestampRef = useRef<number | null>(null);
  const hasShownConflictPromptRef = useRef(false);

  useEffect(() => {
    // Only enable sync for anonymous temporary documents
    if (isAuthenticated || !documentId || !documentId.startsWith('temp-')) {
      return;
    }

    console.log('[DocumentSync] Enabling multi-tab sync for:', documentId);

    // Load initial timestamp
    const initialDoc = loadTemporaryDocument(documentId);
    if (initialDoc) {
      lastKnownTimestampRef.current = initialDoc.lastModified;
    }

    const handleStorageChange = (event: StorageEvent) => {
      // Only listen to changes for our document
      const key = `vrite_temp_document_${documentId}`;

      if (event.key !== key || !event.newValue) {
        return;
      }

      console.log('[DocumentSync] Storage event detected for:', documentId);

      try {
        const updatedDoc = JSON.parse(event.newValue);
        const newTimestamp = updatedDoc.lastModified;
        const lastKnown = lastKnownTimestampRef.current;

        // Check if document was modified in another tab
        if (lastKnown && newTimestamp > lastKnown) {
          console.log(
            '[DocumentSync] Document modified in another tab:',
            `${lastKnown} -> ${newTimestamp}`
          );

          // Prevent showing multiple prompts
          if (hasShownConflictPromptRef.current) {
            return;
          }

          hasShownConflictPromptRef.current = true;

          // Notify parent component about conflict
          if (onConflictDetected) {
            onConflictDetected();
          }

          // Prompt user
          const shouldReload = confirm(
            '📝 Document Updated in Another Tab\n\n' +
            'This document has been modified in another browser tab.\n\n' +
            'Click OK to reload and see the latest changes.\n' +
            'Click Cancel to keep editing your current version.\n\n' +
            'Note: Unsaved changes in this tab will be lost if you reload.'
          );

          if (shouldReload) {
            // Reload the document
            if (onDocumentUpdated) {
              onDocumentUpdated(updatedDoc.content, updatedDoc.title);
            } else {
              // Fallback: reload the page
              window.location.reload();
            }
          } else {
            console.log('[DocumentSync] User chose to keep current version');
          }

          // Update known timestamp regardless of choice
          lastKnownTimestampRef.current = newTimestamp;

          // Reset flag after a delay
          setTimeout(() => {
            hasShownConflictPromptRef.current = false;
          }, 5000);
        }
      } catch (error) {
        console.error('[DocumentSync] Error parsing storage event:', error);
      }
    };

    // Listen for storage events from other tabs
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      console.log('[DocumentSync] Cleanup complete for:', documentId);
    };
  }, [documentId, isAuthenticated, onDocumentUpdated, onConflictDetected]);

  // Function to update the last known timestamp when the current tab saves
  const updateLastKnownTimestamp = useCallback((timestamp: number) => {
    lastKnownTimestampRef.current = timestamp;
  }, []);

  return {
    updateLastKnownTimestamp,
  };
}
