'use client';

import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

interface InactiveSelectionPluginProps {
  isChatFocused: boolean;
}

// Inject the ::highlight CSS rule once via a <style> tag,
// bypassing the build-time CSS parser which doesn't support it yet.
let styleInjected = false;
function injectHighlightStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = '::highlight(inactive-selection) { background-color: #d1d5db; }';
  document.head.appendChild(style);
  styleInjected = true;
}

/**
 * Maintains a visual "grayed-out" selection highlight when the editor loses
 * focus to the AI chat input, using the CSS Custom Highlight API.
 *
 * The browser clears native ::selection when focus moves, so we save the
 * Range and register it as a CSS custom highlight that persists independent
 * of focus.
 */
export default function InactiveSelectionPlugin({ isChatFocused }: InactiveSelectionPluginProps) {
  const [editor] = useLexicalComposerContext();
  const savedRangeRef = useRef<Range | null>(null);

  // Inject the stylesheet on mount
  useEffect(() => {
    injectHighlightStyle();
  }, []);

  // ── 1. Continuously save the current editor selection ──────────────
  useEffect(() => {
    const onSelectionChange = () => {
      const root = editor.getRootElement();
      if (!root) return;

      const domSel = window.getSelection();
      if (!domSel || domSel.rangeCount === 0) return;

      const range = domSel.getRangeAt(0);

      // Only save if the selection is inside our editor and non-collapsed
      if (root.contains(range.commonAncestorContainer) && !range.collapsed) {
        savedRangeRef.current = range.cloneRange();
      }
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [editor]);

  // ── 2. Show / hide the custom highlight based on chat focus ────────
  useEffect(() => {
    // Feature-detect the CSS Custom Highlight API
    if (typeof CSS === 'undefined' || !('highlights' in CSS)) return;

    const highlights = (CSS as any).highlights as Map<string, any>;

    if (isChatFocused && savedRangeRef.current) {
      try {
        const highlight = new (window as any).Highlight(savedRangeRef.current);
        highlights.set('inactive-selection', highlight);
      } catch {
        // Range may have become invalid (e.g. text was deleted)
      }
    } else {
      highlights.delete('inactive-selection');
    }

    return () => {
      highlights.delete('inactive-selection');
    };
  }, [isChatFocused]);

  // ── 3. Clear saved range when selection collapses (editor focused) ─
  useEffect(() => {
    const onSelectionChange = () => {
      if (isChatFocused) return; // Don't clear while chat is focused

      const domSel = window.getSelection();
      if (!domSel || domSel.rangeCount === 0 || domSel.getRangeAt(0).collapsed) {
        savedRangeRef.current = null;
      }
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [isChatFocused]);

  return null;
}
