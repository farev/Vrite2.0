'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNodeByKey, $getRoot } from 'lexical';
import { $createPageBreakNode, $isPageBreakNode } from '../nodes/PageBreakNode';

interface PaginationPluginProps {
  pageHeight: number; // in pixels
  pageWidth: number; // in pixels
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  pageGap: number; // in pixels
  footerHeight: number; // in pixels
  headerHeight?: number; // in pixels (UI header, not margin)
  onPageCountChange?: (count: number) => void;
  headerContent?: string; // Default header for newly created page breaks (template from page 1)
}

// Enable for debugging
const DEBUG_PAGINATION = false;

function debugLog(...args: unknown[]) {
  if (DEBUG_PAGINATION) {
    console.log('[Pagination]', ...args);
  }
}

/**
 * PaginationPlugin - Calculates and manages page breaks
 * Creates visual page boundaries when content exceeds page height
 */
export default function PaginationPlugin({
  pageHeight,
  pageWidth,
  margins,
  pageGap,
  footerHeight,
  headerHeight = 96, // Default header height (matches margin)
  onPageCountChange,
  headerContent = '', // Default header for newly created page breaks
}: PaginationPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [pageCount, setPageCount] = useState(1);
  const lastSignatureRef = useRef<string>('');
  const rafRef = useRef<number | null>(null);
  const isCalculatingRef = useRef(false);

  const calculatePages = useCallback(() => {
    // Prevent re-entrancy
    if (isCalculatingRef.current) {
      return;
    }
    isCalculatingRef.current = true;

    try {
      const rootElement = editor.getRootElement();
      if (!rootElement) {
        debugLog('No root element found');
        isCalculatingRef.current = false;
        return;
      }

      // Calculate available content height per page
      // Account for: margins (top/bottom) and header/footer heights in PageBreakNodes
      const pageContentHeight = pageHeight - margins.top - margins.bottom;
      const pageStride = pageHeight + pageGap;

      debugLog('=== Page Metrics ===');
      debugLog('pageHeight:', pageHeight);
      debugLog('margins:', margins);
      debugLog('footerHeight:', footerHeight);
      debugLog('headerHeight:', headerHeight);
      debugLog('pageContentHeight:', pageContentHeight);
      debugLog('pageStride:', pageStride);

      if (pageContentHeight <= 0) {
        debugLog('ERROR: Invalid page content height:', pageContentHeight);
        isCalculatingRef.current = false;
        return;
      }

      // Get total content height
      const totalContentHeight = rootElement.scrollHeight;
      debugLog('Total content height:', totalContentHeight);

      // Measure all content blocks (excluding existing page breaks)
      type BlockMeasurement = {
        key: string;
        top: number;
        height: number;
        bottom: number;
      };

      const blocks: BlockMeasurement[] = [];
      let existingBreakHeight = 0;

      editor.getEditorState().read(() => {
        const root = $getRoot();
        const children = root.getChildren();

        children.forEach((node) => {
          if ($isPageBreakNode(node)) {
            existingBreakHeight += node.getHeight();
            return;
          }

          const element = editor.getElementByKey(node.getKey());
          if (!element) return;

          const rect = element.getBoundingClientRect();
          const rootRect = rootElement.getBoundingClientRect();

          // Position relative to content area (excluding existing breaks)
          const top = rect.top - rootRect.top - existingBreakHeight;
          const height = rect.height;

          blocks.push({
            key: node.getKey(),
            top,
            height,
            bottom: top + height,
          });
        });
      });

      debugLog('=== Measured Blocks ===');
      debugLog('Total blocks:', blocks.length);
      if (blocks.length > 0) {
        debugLog('First block:', blocks[0]);
        debugLog('Last block:', blocks[blocks.length - 1]);
      }

      // Calculate where page breaks should be inserted
      const breaks: Array<{ key: string; height: number; pageNumber: number }> = [];
      let currentPageEnd = pageContentHeight;
      let accumulatedBreakHeight = 0;
      let lastBlockBottom = 0;
      let currentPageNumber = 1; // Track which page we're on

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];

        // Adjust position for breaks we've decided to add
        const adjustedTop = block.top + accumulatedBreakHeight;
        const adjustedBottom = adjustedTop + block.height;

        debugLog(`Block ${i}: adjustedTop=${adjustedTop.toFixed(0)}, adjustedBottom=${adjustedBottom.toFixed(0)}, currentPageEnd=${currentPageEnd.toFixed(0)}`);

        // Case 1: Block starts at or past the current page boundary
        // We need to insert a page break BEFORE advancing
        if (adjustedTop >= currentPageEnd) {
          // Calculate how much space is left on the current page
          const spaceRemaining = currentPageEnd - lastBlockBottom;

          // Calculate break height: remaining space + footer + gap + header
          // Note: margins are NOT added because footerHeight and headerHeight already represent the margin areas
          const breakHeight = spaceRemaining + footerHeight + pageGap + headerHeight;

          breaks.push({
            key: block.key,
            height: Math.max(breakHeight, 1),
            pageNumber: currentPageNumber, // This break ends page N and starts page N+1
          });

          debugLog(`Page break BEFORE block ${i} (starts past page): breakHeight=${breakHeight.toFixed(0)}, page ${currentPageNumber}`);

          accumulatedBreakHeight += breakHeight;
          currentPageEnd += pageStride;
          currentPageNumber++; // Moving to next page
        }
        // Case 2: Block starts on current page but overflows to next
        else if (adjustedBottom > currentPageEnd) {
          // Calculate remaining space on current page
          const spaceOnCurrentPage = currentPageEnd - adjustedTop;

          // If block doesn't fit in remaining space, break before it
          if (spaceOnCurrentPage < block.height) {
            // Note: margins are NOT added because footerHeight and headerHeight already represent the margin areas
            const breakHeight = spaceOnCurrentPage + footerHeight + pageGap + headerHeight;

            breaks.push({
              key: block.key,
              height: Math.max(breakHeight, 1),
              pageNumber: currentPageNumber, // This break ends page N and starts page N+1
            });

            debugLog(`Page break BEFORE block ${i} (overflows): breakHeight=${breakHeight.toFixed(0)}, page ${currentPageNumber}`);

            accumulatedBreakHeight += breakHeight;
            currentPageEnd += pageStride;
            currentPageNumber++; // Moving to next page
          }
        }

        // Track the bottom of the last block for calculating remaining space
        lastBlockBottom = adjustedBottom;
      }

      debugLog('=== Results ===');
      debugLog('Total breaks to insert:', breaks.length);
      const newPageCount = breaks.length + 1;
      debugLog('New page count:', newPageCount);

      // Create signature to detect changes (include headerContent so header template changes trigger updates)
      const signature = `${headerContent}|${breaks.map((b) => `${b.key}:${Math.round(b.height)}`).join('|')}`;

      // If nothing changed, just update page count if needed
      if (signature === lastSignatureRef.current) {
        if (newPageCount !== pageCount) {
          setPageCount(newPageCount);
          onPageCountChange?.(newPageCount);
        }
        isCalculatingRef.current = false;
        return;
      }

      lastSignatureRef.current = signature;

      // Apply page breaks to the editor
      editor.update(
        () => {
          const root = $getRoot();

          // Capture each existing page break's header/footer content before removing it,
          // keyed by page number so it can be restored to the new node at the same position.
          const savedContent = new Map<number, { headerText: string; footerText: string }>();
          let removedCount = 0;
          root.getChildren().forEach((node) => {
            if ($isPageBreakNode(node)) {
              savedContent.set(node.getPageNumber(), {
                headerText: node.getHeaderText(),
                footerText: node.getFooterText(),
              });
              node.remove();
              removedCount++;
            }
          });
          debugLog('Removed existing breaks:', removedCount);

          // Insert new page breaks, preserving per-page header/footer content.
          // New page breaks (no prior content) default to headerContent for the header
          // (template from the first-page header) and empty for the footer.
          breaks.forEach((breakItem) => {
            const targetNode = $getNodeByKey(breakItem.key);
            if (targetNode) {
              const existing = savedContent.get(breakItem.pageNumber);
              const pageBreak = $createPageBreakNode(
                Math.round(breakItem.height),
                breakItem.pageNumber,
                existing?.footerText ?? '',            // preserve custom footer or empty
                existing?.headerText ?? headerContent, // preserve custom header or use template
                true
              );
              targetNode.insertBefore(pageBreak);
              debugLog('Inserted page break before:', breakItem.key, 'page:', breakItem.pageNumber);
            }
          });
        },
        { tag: 'pagination' }
      );

      // Update page count
      if (newPageCount !== pageCount) {
        setPageCount(newPageCount);
        onPageCountChange?.(newPageCount);
      }
    } catch (error) {
      console.error('[Pagination] Error:', error);
    } finally {
      isCalculatingRef.current = false;
    }
  }, [
    editor,
    footerHeight,
    headerHeight,
    margins,
    pageGap,
    pageHeight,
    pageCount,
    onPageCountChange,
    headerContent,
  ]);

  // Schedule calculation after editor updates
  useEffect(() => {
    const schedule = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      // Use double rAF to ensure DOM is fully updated
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          calculatePages();
        });
      });
    };

    const unregister = editor.registerUpdateListener(({ tags }) => {
      // Skip if this update was triggered by pagination
      if (tags.has('pagination')) {
        return;
      }
      schedule();
    });

    // Initial calculation with delay to ensure DOM is ready
    const timeoutId = setTimeout(schedule, 100);

    return () => {
      clearTimeout(timeoutId);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      unregister();
    };
  }, [editor, calculatePages]);

  // Recalculate on window resize
  useEffect(() => {
    const handleResize = () => {
      lastSignatureRef.current = ''; // Force recalculation
      calculatePages();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculatePages]);

  // Listen for header/footer edit events from PageBreakNodes
  useEffect(() => {
    const rootElement = editor.getRootElement();
    if (!rootElement) return;

    const handleFooterEdit = (e: Event) => {
      const customEvent = e as CustomEvent<{ nodeKey: string; text: string }>;
      const { nodeKey, text } = customEvent.detail;

      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isPageBreakNode(node)) {
          node.setFooterText(text);
        }
      });
    };

    const handleHeaderEdit = (e: Event) => {
      const customEvent = e as CustomEvent<{ nodeKey: string; text: string }>;
      const { nodeKey, text } = customEvent.detail;

      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isPageBreakNode(node)) {
          node.setHeaderText(text);
        }
      });
    };

    rootElement.addEventListener('pagebreak-footer-edit', handleFooterEdit);
    rootElement.addEventListener('pagebreak-header-edit', handleHeaderEdit);

    return () => {
      rootElement.removeEventListener('pagebreak-footer-edit', handleFooterEdit);
      rootElement.removeEventListener('pagebreak-header-edit', handleHeaderEdit);
    };
  }, [editor]);

  return null;
}
