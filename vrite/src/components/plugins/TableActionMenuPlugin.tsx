'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
  $getNodeByKey,
} from 'lexical';
import {
  $isTableNode,
  $isTableCellNode,
  $isTableRowNode,
  $insertTableRow__EXPERIMENTAL,
  $insertTableColumn__EXPERIMENTAL,
  $deleteTableRow__EXPERIMENTAL,
  $deleteTableColumn__EXPERIMENTAL,
  TableCellNode,
} from '@lexical/table';
import {
  Plus,
  Minus,
  Palette,
  X,
} from 'lucide-react';

interface TableActionMenuProps {
  anchorElem?: HTMLElement;
}

export default function TableActionMenuPlugin({ anchorElem }: TableActionMenuProps) {
  const [editor] = useLexicalComposerContext();
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedCell, setSelectedCell] = useState<TableCellNode | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const updateMenuPosition = useCallback((event: MouseEvent) => {
    setMenuPosition({ x: event.clientX, y: event.clientY });
  }, []);

  const handleContextMenu = useCallback((event: MouseEvent) => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      const nativeSelection = window.getSelection();
      const activeElement = document.activeElement;
      const target = event.target as HTMLElement;

      // Check if click is inside a table cell
      const cellElement = target.closest('td, th');
      if (!cellElement) {
        setShowMenu(false);
        return;
      }

      // Find the table cell node
      let cellNode: TableCellNode | null = null;
      const editorState = editor.getEditorState();
      editorState._nodeMap.forEach((node) => {
        if ($isTableCellNode(node)) {
          // Check if this is the cell that was clicked
          const domElement = editor.getElementByKey(node.getKey());
          if (domElement === cellElement) {
            cellNode = node;
          }
        }
      });

      if (cellNode) {
        event.preventDefault();
        setSelectedCell(cellNode);
        updateMenuPosition(event);
        setShowMenu(true);
      }
    });
  }, [editor, updateMenuPosition]);

  useEffect(() => {
    const editorElement = anchorElem || editor.getRootElement();
    if (!editorElement) return;

    editorElement.addEventListener('contextmenu', handleContextMenu);

    return () => {
      editorElement.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [editor, anchorElem, handleContextMenu]);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.table-context-menu')) {
        setShowMenu(false);
        setShowColorPicker(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const insertRowAbove = () => {
    if (!selectedCell) return;
    editor.update(() => {
      $insertTableRow__EXPERIMENTAL(false);
    });
    setShowMenu(false);
  };

  const insertRowBelow = () => {
    if (!selectedCell) return;
    editor.update(() => {
      $insertTableRow__EXPERIMENTAL(true);
    });
    setShowMenu(false);
  };

  const insertColumnLeft = () => {
    if (!selectedCell) return;
    editor.update(() => {
      $insertTableColumn__EXPERIMENTAL(false);
    });
    setShowMenu(false);
  };

  const insertColumnRight = () => {
    if (!selectedCell) return;
    editor.update(() => {
      $insertTableColumn__EXPERIMENTAL(true);
    });
    setShowMenu(false);
  };

  const deleteRow = () => {
    if (!selectedCell) return;
    editor.update(() => {
      $deleteTableRow__EXPERIMENTAL();
    });
    setShowMenu(false);
  };

  const deleteColumn = () => {
    if (!selectedCell) return;
    editor.update(() => {
      $deleteTableColumn__EXPERIMENTAL();
    });
    setShowMenu(false);
  };

  const setCellBackgroundColor = (color: string) => {
    if (!selectedCell) return;
    editor.update(() => {
      if (selectedCell) {
        selectedCell.setBackgroundColor(color);
      }
    });
    setShowColorPicker(false);
  };

  const commonColors = [
    '#ffffff', '#f3f4f6', '#e5e7eb', '#d1d5db',
    '#fecaca', '#fed7aa', '#fef3c7', '#d9f99d',
    '#bbf7d0', '#a7f3d0', '#99f6e4', '#a5f3fc',
    '#bae6fd', '#c4b5fd', '#e9d5ff', '#fbcfe8',
  ];

  if (!showMenu) return null;

  return (
    <div
      className="table-context-menu"
      style={{
        position: 'fixed',
        top: menuPosition.y,
        left: menuPosition.x,
        zIndex: 1000,
      }}
    >
      <div className="menu-dropdown" style={{ position: 'relative', padding: '4px 0' }}>
        <button onClick={insertRowAbove} className="menu-dropdown-item">
          <Plus size={16} />
          Insert Row Above
        </button>
        <button onClick={insertRowBelow} className="menu-dropdown-item">
          <Plus size={16} />
          Insert Row Below
        </button>
        <div className="menu-dropdown-divider" />
        <button onClick={insertColumnLeft} className="menu-dropdown-item">
          <Plus size={16} />
          Insert Column Left
        </button>
        <button onClick={insertColumnRight} className="menu-dropdown-item">
          <Plus size={16} />
          Insert Column Right
        </button>
        <div className="menu-dropdown-divider" />
        <button onClick={deleteRow} className="menu-dropdown-item" style={{ color: '#dc2626' }}>
          <Minus size={16} />
          Delete Row
        </button>
        <button onClick={deleteColumn} className="menu-dropdown-item" style={{ color: '#dc2626' }}>
          <Minus size={16} />
          Delete Column
        </button>
        <div className="menu-dropdown-divider" />
        <button
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="menu-dropdown-item"
        >
          <Palette size={16} />
          Cell Background
        </button>
        {showColorPicker && (
          <div className="color-picker-submenu">
            <div style={{ padding: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                {commonColors.map((color) => (
                  <div
                    key={color}
                    onClick={() => setCellBackgroundColor(color)}
                    style={{
                      width: '24px',
                      height: '24px',
                      backgroundColor: color,
                      border: '1px solid #d1d5db',
                      borderRadius: '3px',
                      cursor: 'pointer',
                    }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
