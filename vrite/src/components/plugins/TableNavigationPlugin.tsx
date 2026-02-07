'use client';

import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $getNodeByKey,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  $setSelection,
} from 'lexical';
import {
  $isTableNode,
  $isTableCellNode,
  $isTableRowNode,
} from '@lexical/table';

export default function TableNavigationPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Handle Enter key to exit table
    const removeEnterCommand = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;

        const anchor = selection.anchor.getNode();
        let cellNode = anchor;

        // Find the table cell
        while (cellNode && !$isTableCellNode(cellNode)) {
          cellNode = cellNode.getParent();
        }

        if (!$isTableCellNode(cellNode)) return false;

        // Check if we're in the last cell of the table
        const rowNode = cellNode.getParent();
        if (!$isTableRowNode(rowNode)) return false;

        const tableNode = rowNode.getParent();
        if (!$isTableNode(tableNode)) return false;

        const rows = tableNode.getChildren();
        const lastRow = rows[rows.length - 1];

        if (rowNode.getKey() === lastRow.getKey()) {
          const cells = rowNode.getChildren();
          const lastCell = cells[cells.length - 1];

          if (cellNode.getKey() === lastCell.getKey()) {
            // We're in the last cell - check if Shift is pressed
            if (!event?.shiftKey) {
              // Create paragraph after table
              editor.update(() => {
                const newParagraph = $createParagraphNode();
                tableNode.insertAfter(newParagraph);
                newParagraph.select();
              });
              event?.preventDefault();
              return true;
            }
          }
        }

        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    // Handle Arrow Down to move after table
    const removeArrowDownCommand = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;

        const anchor = selection.anchor.getNode();
        let cellNode = anchor;

        // Find the table cell
        while (cellNode && !$isTableCellNode(cellNode)) {
          cellNode = cellNode.getParent();
        }

        if (!$isTableCellNode(cellNode)) return false;

        const rowNode = cellNode.getParent();
        if (!$isTableRowNode(rowNode)) return false;

        const tableNode = rowNode.getParent();
        if (!$isTableNode(tableNode)) return false;

        const rows = tableNode.getChildren();
        const lastRow = rows[rows.length - 1];

        // If we're in the last row
        if (rowNode.getKey() === lastRow.getKey()) {
          const nextSibling = tableNode.getNextSibling();

          if (nextSibling) {
            // Move to next element
            editor.update(() => {
              nextSibling.selectStart();
            });
            event?.preventDefault();
            return true;
          } else {
            // Create a new paragraph after the table
            editor.update(() => {
              const newParagraph = $createParagraphNode();
              tableNode.insertAfter(newParagraph);
              newParagraph.select();
            });
            event?.preventDefault();
            return true;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    // Handle Arrow Up to move before table
    const removeArrowUpCommand = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;

        const anchor = selection.anchor.getNode();
        let cellNode = anchor;

        // Find the table cell
        while (cellNode && !$isTableCellNode(cellNode)) {
          cellNode = cellNode.getParent();
        }

        if (!$isTableCellNode(cellNode)) return false;

        const rowNode = cellNode.getParent();
        if (!$isTableRowNode(rowNode)) return false;

        const tableNode = rowNode.getParent();
        if (!$isTableNode(tableNode)) return false;

        const rows = tableNode.getChildren();
        const firstRow = rows[0];

        // If we're in the first row
        if (rowNode.getKey() === firstRow.getKey()) {
          const prevSibling = tableNode.getPreviousSibling();

          if (prevSibling) {
            // Move to previous element
            editor.update(() => {
              prevSibling.selectEnd();
            });
            event?.preventDefault();
            return true;
          } else {
            // Create a new paragraph before the table
            editor.update(() => {
              const newParagraph = $createParagraphNode();
              tableNode.insertBefore(newParagraph);
              newParagraph.select();
            });
            event?.preventDefault();
            return true;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    return () => {
      removeEnterCommand();
      removeArrowDownCommand();
      removeArrowUpCommand();
    };
  }, [editor]);

  return null;
}
