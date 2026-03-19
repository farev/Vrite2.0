'use client';
import { useEffect } from 'react';
import {
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $isTextNode,
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $setBlocksType, $patchStyleText, $getSelectionStyleValueForProperty } from '@lexical/selection';
import { $createHeadingNode } from '@lexical/rich-text';
import {
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
} from '@lexical/list';
import { $createEquationNode } from '../nodes/EquationNode';

export default function FormattingKeyboardShortcutsPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const shift = event.shiftKey;
      const alt = event.altKey;
      const key = event.key.toLowerCase();
      const code = event.code;

      // Note: Bold (Cmd+B), Italic (Cmd+I), Underline (Cmd+U) are already handled
      // by Lexical's RichTextPlugin — do not re-dispatch them here.

      // Strikethrough: Cmd+Shift+X or Alt+Shift+5
      if ((mod && shift && key === 'x') || (alt && shift && code === 'Digit5')) {
        event.preventDefault();
        event.stopPropagation();
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough');
        return;
      }

      // Superscript: Cmd+.
      if (mod && !shift && !alt && key === '.') {
        event.preventDefault();
        event.stopPropagation();
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'superscript');
        return;
      }

      // Subscript: Cmd+,
      if (mod && !shift && !alt && key === ',') {
        event.preventDefault();
        event.stopPropagation();
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'subscript');
        return;
      }

      // --- Font size ---
      // Increase: Cmd+Shift+>
      if (mod && shift && !alt && key === '>') {
        event.preventDefault();
        event.stopPropagation();
        editor.update(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) return;
          const raw = $getSelectionStyleValueForProperty(sel, 'font-size', '12pt');
          const cur = Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : 12;
          $patchStyleText(sel, { 'font-size': `${Math.min(72, cur + 1)}pt` });
        });
        return;
      }

      // Decrease: Cmd+Shift+<
      if (mod && shift && !alt && key === '<') {
        event.preventDefault();
        event.stopPropagation();
        editor.update(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) return;
          const raw = $getSelectionStyleValueForProperty(sel, 'font-size', '12pt');
          const cur = Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : 12;
          $patchStyleText(sel, { 'font-size': `${Math.max(6, cur - 1)}pt` });
        });
        return;
      }

      // --- Clear formatting: Cmd+\ ---
      if (mod && !shift && !alt && key === '\\') {
        event.preventDefault();
        event.stopPropagation();
        editor.update(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) return;
          sel.getNodes().forEach(node => {
            if ($isTextNode(node)) {
              node.setFormat(0);
              node.setStyle('');
            }
          });
          $setBlocksType(sel, () => $createParagraphNode());
        });
        return;
      }

      // --- Alignment ---
      if (mod && shift && !alt && key === 'l') {
        event.preventDefault();
        event.stopPropagation();
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left');
        return;
      }
      if (mod && shift && !alt && key === 'e') {
        event.preventDefault();
        event.stopPropagation();
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center');
        return;
      }
      if (mod && shift && !alt && key === 'r') {
        event.preventDefault();
        event.stopPropagation();
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right');
        return;
      }
      if (mod && shift && !alt && key === 'j') {
        event.preventDefault();
        event.stopPropagation();
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'justify');
        return;
      }

      // --- Indentation ---
      // Increase indent: Cmd+]
      if (mod && !shift && !alt && key === ']') {
        event.preventDefault();
        event.stopPropagation();
        editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
        return;
      }

      // Decrease indent: Cmd+[
      if (mod && !shift && !alt && key === '[') {
        event.preventDefault();
        event.stopPropagation();
        editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
        return;
      }

      // --- Lists ---
      // Numbered list: Cmd+Shift+7
      if (mod && shift && !alt && code === 'Digit7') {
        event.preventDefault();
        event.stopPropagation();
        let isNumbered = false;
        editor.getEditorState().read(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) return;
          let parent = sel.anchor.getNode().getParent();
          while (parent) {
            if ($isListNode(parent)) {
              isNumbered = parent.getListType() === 'number';
              break;
            }
            parent = parent.getParent();
          }
        });
        editor.dispatchCommand(
          isNumbered ? REMOVE_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND,
          undefined
        );
        return;
      }

      // Bulleted list: Cmd+Shift+8
      if (mod && shift && !alt && code === 'Digit8') {
        event.preventDefault();
        event.stopPropagation();
        let isBullet = false;
        editor.getEditorState().read(() => {
          const sel = $getSelection();
          if (!$isRangeSelection(sel)) return;
          let parent = sel.anchor.getNode().getParent();
          while (parent) {
            if ($isListNode(parent)) {
              isBullet = parent.getListType() === 'bullet';
              break;
            }
            parent = parent.getParent();
          }
        });
        editor.dispatchCommand(
          isBullet ? REMOVE_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND,
          undefined
        );
        return;
      }

      // --- Block type (Cmd+Alt+digit) ---
      // Normal text: Cmd+Alt+0
      if (mod && alt && !shift && code === 'Digit0') {
        event.preventDefault();
        event.stopPropagation();
        editor.update(() => {
          const sel = $getSelection();
          if ($isRangeSelection(sel)) {
            $setBlocksType(sel, () => $createParagraphNode());
          }
        });
        return;
      }

      // Heading 1: Cmd+Alt+1
      if (mod && alt && !shift && code === 'Digit1') {
        event.preventDefault();
        event.stopPropagation();
        editor.update(() => {
          const sel = $getSelection();
          if ($isRangeSelection(sel)) {
            $setBlocksType(sel, () => $createHeadingNode('h1'));
          }
        });
        return;
      }

      // Heading 2: Cmd+Alt+2
      if (mod && alt && !shift && code === 'Digit2') {
        event.preventDefault();
        event.stopPropagation();
        editor.update(() => {
          const sel = $getSelection();
          if ($isRangeSelection(sel)) {
            $setBlocksType(sel, () => $createHeadingNode('h2'));
          }
        });
        return;
      }

      // Heading 3: Cmd+Alt+3
      if (mod && alt && !shift && code === 'Digit3') {
        event.preventDefault();
        event.stopPropagation();
        editor.update(() => {
          const sel = $getSelection();
          if ($isRangeSelection(sel)) {
            $setBlocksType(sel, () => $createHeadingNode('h3'));
          }
        });
        return;
      }

      // --- Insert equation: Alt+= ---
      if (!mod && !shift && alt && key === '=') {
        event.preventDefault();
        event.stopPropagation();
        editor.update(() => {
          const sel = $getSelection();
          if ($isRangeSelection(sel)) {
            sel.insertNodes([$createEquationNode('', true)]);
          }
        });
        return;
      }
    };

    return editor.registerRootListener((rootElement, prevRootElement) => {
      if (prevRootElement !== null) {
        prevRootElement.removeEventListener('keydown', handleKeyDown);
      }
      if (rootElement !== null) {
        rootElement.addEventListener('keydown', handleKeyDown);
      }
    });
  }, [editor]);

  return null;
}
