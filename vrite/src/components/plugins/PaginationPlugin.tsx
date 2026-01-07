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
  onPageCountChange?: (count: number) => void;
}

/**
 * PaginationPlugin - Calculates and manages page breaks
 * Note: This is a simplified version. A production implementation would need
 * more sophisticated layout calculations and page break handling.
 */
export default function PaginationPlugin({
  pageHeight,
  pageWidth,
  margins,
  pageGap,
  footerHeight,
  onPageCountChange,
}: PaginationPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [pageCount, setPageCount] = useState(1);
  const lastSignatureRef = useRef<string>('');
  const rafRef = useRef<number | null>(null);

  const calculatePages = useCallback(() => {
    const rootElement = editor.getRootElement();
    if (!rootElement) return;

    const rootRect = rootElement.getBoundingClientRect();
    const pageContentHeight = pageHeight - margins.top - margins.bottom - footerHeight;
    const pageStride = pageHeight + pageGap;

    if (pageContentHeight <= 0) {
      return;
    }

    type Measurement =
      | { type: 'break'; height: number }
      | { type: 'block'; key: string; top: number; height: number };

    const measurements = editor.getEditorState().read(() => {
      const root = $getRoot();
      const items: Measurement[] = [];

      root.getChildren().forEach((node) => {
        if ($isPageBreakNode(node)) {
          items.push({ type: 'break', height: node.getHeight() });
          return;
        }

        const element = editor.getElementByKey(node.getKey());
        if (!element) {
          return;
        }

        const rect = element.getBoundingClientRect();
        items.push({
          type: 'block',
          key: node.getKey(),
          top: rect.top - rootRect.top,
          height: rect.height,
        });
      });

      return items;
    });

    let cumulativeBreakOffset = 0;
    let pageStart = 0;
    const breaks: Array<{ key: string; height: number }> = [];

    measurements.forEach((item) => {
      if (item.type === 'break') {
        cumulativeBreakOffset += item.height;
        return;
      }

      const adjustedTop = item.top - cumulativeBreakOffset;
      let blockOffset = adjustedTop - pageStart;

      while (blockOffset >= pageContentHeight) {
        pageStart += pageStride;
        blockOffset = adjustedTop - pageStart;
      }

      if (blockOffset + item.height > pageContentHeight && blockOffset > 0) {
        const remaining = pageContentHeight - blockOffset;
        const breakHeight = Math.max(
          0,
          remaining + margins.bottom + footerHeight + pageGap + margins.top
        );

        breaks.push({ key: item.key, height: breakHeight });
        pageStart += pageStride;
      }
    });

    const signature = breaks
      .map((breakItem) => `${breakItem.key}:${Math.round(breakItem.height)}`)
      .join('|');

    if (signature === lastSignatureRef.current) {
      const newPageCount = Math.max(1, breaks.length + 1);
      if (newPageCount !== pageCount) {
        setPageCount(newPageCount);
        onPageCountChange?.(newPageCount);
      }
      return;
    }

    lastSignatureRef.current = signature;

    editor.update(() => {
      const root = $getRoot();
      root.getChildren().forEach((node) => {
        if ($isPageBreakNode(node)) {
          node.remove();
        }
      });

      breaks.forEach((breakItem) => {
        const targetNode = $getNodeByKey(breakItem.key);
        if (targetNode) {
          targetNode.insertBefore($createPageBreakNode(Math.round(breakItem.height)));
        }
      });
    }, { tag: 'pagination' });

    const newPageCount = Math.max(1, breaks.length + 1);
    if (newPageCount !== pageCount) {
      setPageCount(newPageCount);
      onPageCountChange?.(newPageCount);
    }
  }, [editor, footerHeight, margins.bottom, margins.top, pageGap, pageHeight, pageCount, onPageCountChange]);

  useEffect(() => {
    const schedule = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        calculatePages();
      });
    };

    const unregister = editor.registerUpdateListener(({ tags }) => {
      if (tags.has('pagination')) {
        return;
      }
      schedule();
    });

    schedule();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      unregister();
    };
  }, [editor, calculatePages]);

  // Recalculate on window resize
  useEffect(() => {
    const handleResize = () => calculatePages();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculatePages]);

  return null;
}
