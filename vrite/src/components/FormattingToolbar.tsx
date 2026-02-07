'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  ElementFormatType,
  $isElementNode,
} from 'lexical';
import {
  $createHeadingNode,
  HeadingTagType,
  $isHeadingNode,
} from '@lexical/rich-text';
import { $setBlocksType, $patchStyleText } from '@lexical/selection';
import { $createParagraphNode, $isTextNode } from 'lexical';
import {
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
} from '@lexical/list';
import { INSERT_TABLE_COMMAND } from '@lexical/table';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createEquationNode } from './nodes/EquationNode';
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo,
  Redo,
  Sparkles,
  ChevronDown,
  Palette,
  Highlighter,
  Type,
  AlignVerticalJustifyStart,
  FileText,
  Strikethrough,
  Subscript,
  Superscript,
  RemoveFormatting,
  IndentIncrease,
  IndentDecrease,
  MoreVertical,
  List,
  ListOrdered,
  Table,
} from 'lucide-react';

interface FormattingToolbarProps {
  onAIToggle?: () => void;
  documentMargins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  onMarginsChange?: (margins: { top: number; right: number; bottom: number; left: number }) => void;
  onFormatDocument?: (formatType: string) => void;
  pageSize?: string;
  onPageSizeChange?: (size: string) => void;
}

export default function FormattingToolbar({
  onAIToggle,
  documentMargins = { top: 72, right: 72, bottom: 72, left: 72 },
  onMarginsChange,
  onFormatDocument,
  pageSize = 'letter',
  onPageSizeChange
}: FormattingToolbarProps) {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isSubscript, setIsSubscript] = useState(false);
  const [isSuperscript, setIsSuperscript] = useState(false);
  const [isBulletList, setIsBulletList] = useState(false);
  const [isNumberedList, setIsNumberedList] = useState(false);
  const [fontSize, setFontSize] = useState('12pt');
  const [fontFamily, setFontFamily] = useState('Times New Roman');
  const [blockType, setBlockType] = useState('paragraph');
  const [textColor, setTextColor] = useState('#000000');
  const [textAlign, setTextAlign] = useState('left');

  // Dropdown states - only one can be open at a time
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // Refs for click-outside detection and overflow calculation
  const toolbarRef = useRef<HTMLDivElement>(null);
  const mainToolbarRef = useRef<HTMLDivElement>(null);

  // Track which items are overflowing
  const [overflowItems, setOverflowItems] = useState<Set<string>>(new Set());

  const fontSizes = ['8pt', '9pt', '10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt', '28pt', '36pt', '48pt', '72pt'];
  const fontFamilies = [
    'Times New Roman',
    'Arial',
    'Calibri',
    'Cambria',
    'Georgia',
    'Verdana',
    'Trebuchet MS',
    'Comic Sans MS',
    'Impact',
    'Lucida Console'
  ];
  const lineSpacings = [
    { label: '1.0', value: '1.0' },
    { label: '1.15', value: '1.15' },
    { label: '1.5', value: '1.5' },
    { label: '2.0', value: '2.0' },
    { label: '2.5', value: '2.5' },
    { label: '3.0', value: '3.0' }
  ];

  const documentFormats = [
    { label: 'APA Format', value: 'APA', description: 'American Psychological Association' },
    { label: 'MLA Format', value: 'MLA', description: 'Modern Language Association' },
    { label: 'Chicago Style', value: 'Chicago', description: 'Chicago Manual of Style' },
    { label: 'Resume', value: 'Resume', description: 'Professional resume format' },
    { label: 'Cover Letter', value: 'CoverLetter', description: 'Professional cover letter' },
    { label: 'Business Letter', value: 'BusinessLetter', description: 'Formal business letter' },
  ];

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      setIsBold(selection.hasFormat('bold'));
      setIsItalic(selection.hasFormat('italic'));
      setIsUnderline(selection.hasFormat('underline'));
      setIsStrikethrough(selection.hasFormat('strikethrough'));
      setIsSubscript(selection.hasFormat('subscript'));
      setIsSuperscript(selection.hasFormat('superscript'));

      // Get block type and alignment
      const anchorNode = selection.anchor.getNode();
      const element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow();

      // Check if we're in a list
      let parent = anchorNode.getParent();
      let isInBulletList = false;
      let isInNumberedList = false;
      while (parent) {
        if ($isListNode(parent)) {
          const listType = parent.getListType();
          isInBulletList = listType === 'bullet';
          isInNumberedList = listType === 'number';
          break;
        }
        parent = parent.getParent();
      }
      setIsBulletList(isInBulletList);
      setIsNumberedList(isInNumberedList);

      if ($isHeadingNode(element)) {
        setBlockType(element.getTag());
      } else {
        setBlockType('paragraph');
      }

      // Get text alignment from Lexical's native format property
      if ($isElementNode(element)) {
        const formatType = element.getFormatType();
        setTextAlign(formatType || 'left');
      } else {
        setTextAlign('left');
      }

      // Get font family and font size from the selected text node
      const node = selection.anchor.type === 'text'
        ? selection.anchor.getNode()
        : selection.getNodes().find($isTextNode);

      if (node && $isTextNode(node)) {
        const style = node.getStyle();
        if (style) {
          // Parse font-family
          const fontFamilyMatch = style.match(/font-family:\s*["']?([^;"']+)["']?/);
          if (fontFamilyMatch) {
            setFontFamily(fontFamilyMatch[1]);
          } else {
            setFontFamily('Times New Roman'); // Default
          }

          // Parse font-size
          const fontSizeMatch = style.match(/font-size:\s*([^;]+)/);
          if (fontSizeMatch) {
            setFontSize(fontSizeMatch[1].trim());
          } else {
            setFontSize('12pt'); // Default
          }

          // Parse text color
          const colorMatch = style.match(/color:\s*([^;]+)/);
          if (colorMatch) {
            setTextColor(colorMatch[1].trim());
          } else {
            setTextColor('#000000'); // Default
          }
        } else {
          // No style, use defaults
          setFontFamily('Times New Roman');
          setFontSize('12pt');
          setTextColor('#000000');
        }
      }
    }
  }, [editor]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        updateToolbar();
      });
    });
  }, [editor, updateToolbar]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
        setIsMoreOpen(false);
      }
    };

    // Use capture phase to ensure we catch the event before other handlers
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, []);

  // Handle responsive overflow with ResizeObserver
  useEffect(() => {
    const mainToolbar = mainToolbarRef.current;
    const toolbar = toolbarRef.current;
    if (!mainToolbar || !toolbar) return;

    const calculateOverflow = () => {
      // Get the actual container width from the parent toolbar
      const containerWidth = toolbar.offsetWidth;
      const children = Array.from(mainToolbar.children) as HTMLElement[];

      // Reserve space for the more button (40px) plus gaps and padding
      const moreButtonWidth = 50;
      const totalPadding = 32; // Left and right padding
      const availableWidth = containerWidth - moreButtonWidth - totalPadding - 8;

      let usedWidth = 0;
      const newOverflowItems = new Set<string>();

      // Build array of items with their actual widths
      const items: { id: string; width: number; alwaysVisible: boolean }[] = [];

      children.forEach((child) => {
        const itemId = child.getAttribute('data-toolbar-item');
        if (!itemId) return;

        // Skip the more menu button - it's always visible
        if (itemId === 'more-menu') return;

        // Temporarily make visible to measure
        const currentDisplay = (child as HTMLElement).style.display;
        (child as HTMLElement).style.display = '';

        const childWidth = child.offsetWidth + 4; // Add gap

        // Restore display
        (child as HTMLElement).style.display = currentDisplay;

        // Always keep visible: undo/redo, their divider, AI button, and AI divider
        const alwaysVisible = itemId === 'undo-redo' ||
                             itemId === 'undo-redo-divider' ||
                             itemId === 'ai-assistant' ||
                             itemId === 'ai-divider';

        if (alwaysVisible) {
          usedWidth += childWidth;
        } else {
          items.push({ id: itemId, width: childWidth, alwaysVisible: false });
        }
      });

      // Determine which items overflow
      for (const item of items) {
        if (usedWidth + item.width > availableWidth) {
          newOverflowItems.add(item.id);
        } else {
          usedWidth += item.width;
        }
      }

      // Only update if there's a change to avoid infinite loops
      setOverflowItems(prev => {
        const hasChanged = prev.size !== newOverflowItems.size ||
          Array.from(newOverflowItems).some(id => !prev.has(id));
        return hasChanged ? newOverflowItems : prev;
      });
    };

    // Initial calculation
    const timeoutId = setTimeout(calculateOverflow, 150);

    // Watch for resize
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(calculateOverflow);
    });

    resizeObserver.observe(toolbar);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, []);

  const formatHeading = (headingSize: HeadingTagType) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createHeadingNode(headingSize));
      }
    });
    setOpenDropdown(null);
  };

  const formatParagraph = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createParagraphNode());
      }
    });
    setOpenDropdown(null);
  };

  const toggleBulletList = () => {
    if (isBulletList) {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    }
    setOpenDropdown(null);
  };

  const toggleNumberedList = () => {
    if (isNumberedList) {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    }
    setOpenDropdown(null);
  };

  const insertTable = (rows: number, columns: number) => {
    editor.update(() => {
      editor.dispatchCommand(INSERT_TABLE_COMMAND, {
        rows: rows.toString(),
        columns: columns.toString(),
      });

      // Add a paragraph after the table for easier navigation
      setTimeout(() => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const anchor = selection.anchor.getNode();
            let node = anchor;

            // Find the table node
            while (node && node.getType() !== 'table') {
              node = node.getParent();
            }

            if (node && node.getType() === 'table') {
              const nextSibling = node.getNextSibling();
              if (!nextSibling) {
                const newParagraph = $createParagraphNode();
                node.insertAfter(newParagraph);
              }
            }
          }
        });
      }, 10);
    });
    setOpenDropdown(null);
  };

  const applyFontSize = (size: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, { 'font-size': size });
      }
    });
    setFontSize(size);
    setOpenDropdown(null);
  };

  const applyFontFamily = (family: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, { 'font-family': `"${family}"` });
      }
    });
    setFontFamily(family);
    setOpenDropdown(null);
  };

  const applyLineHeight = (height: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        // Apply line height to the paragraph/block element
        const anchorNode = selection.anchor.getNode();
        const element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow();
        if (element) {
          const elementDOM = editor.getElementByKey(element.getKey());
          if (elementDOM) {
            elementDOM.style.lineHeight = height;
          }
        }
      }
    });
    setOpenDropdown(null);
  };

  const applyTextAlign = (align: 'left' | 'center' | 'right' | 'justify') => {
    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, align as ElementFormatType);
    setTextAlign(align);
  };

  const applyTextColor = (color: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, { 'color': color });
      }
    });
    setTextColor(color);
    setOpenDropdown(null);
  };

  const applyHighlight = (color: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, { 'background-color': color });
      }
    });
    setOpenDropdown(null);
  };

  const clearFormatting = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        // Clear formatting from text nodes
        const nodes = selection.getNodes();
        nodes.forEach((node) => {
          if ($isTextNode(node)) {
            // Clear all formatting by setting format to 0
            node.setFormat(0);
            node.setStyle('');
          }
        });

        // Reset block to paragraph
        $setBlocksType(selection, () => $createParagraphNode());
      }
    });
  };

  const indentIncrease = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        const element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow();
        if (element) {
          const elementDOM = editor.getElementByKey(element.getKey());
          if (elementDOM) {
            const currentIndent = parseInt(elementDOM.style.marginLeft || '0');
            elementDOM.style.marginLeft = `${currentIndent + 36}pt`;
          }
        }
      }
    });
  };

  const indentDecrease = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        const element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow();
        if (element) {
          const elementDOM = editor.getElementByKey(element.getKey());
          if (elementDOM) {
            const currentIndent = parseInt(elementDOM.style.marginLeft || '0');
            elementDOM.style.marginLeft = `${Math.max(0, currentIndent - 36)}pt`;
          }
        }
      }
    });
  };

  const insertEquation = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        // Insert an empty equation which will open in edit mode automatically
        const equationNode = $createEquationNode('', true);
        selection.insertNodes([equationNode]);
      }
    });
  };

  const handleMarginChange = (side: 'top' | 'right' | 'bottom' | 'left', value: number) => {
    const newMargins = { ...documentMargins, [side]: value };
    onMarginsChange?.(newMargins);
  };

  const handleFormatSelection = (formatType: string) => {
    onFormatDocument?.(formatType);
    setOpenDropdown(null);
  };

  const toggleDropdown = (dropdown: string) => {
    setOpenDropdown((prev) => (prev === dropdown ? null : dropdown));
  };

  const toggleMoreMenu = () => {
    setIsMoreOpen((prev) => !prev);
    setOpenDropdown(null);
  };

  // Helper function to check if an item should be hidden (overflow)
  const isOverflowing = (itemId: string) => overflowItems.has(itemId);

  return (
    <div className="formatting-toolbar" ref={toolbarRef}>
      <div className="formatting-toolbar-main" ref={mainToolbarRef}>
        {/* Undo/Redo - Always visible at the left */}
        <div className="toolbar-section" data-toolbar-item="undo-redo" style={{ marginLeft: '8px' }}>
          <button
            className="toolbar-button"
            onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
            title="Undo (Ctrl+Z)"
          >
            <Undo size={18} />
          </button>
          <button
            className="toolbar-button"
            onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
            title="Redo (Ctrl+Y)"
          >
            <Redo size={18} />
          </button>
        </div>

        <div className="toolbar-divider" data-toolbar-item="undo-redo-divider" />

        {/* Style Dropdown */}
        <div
          className="toolbar-dropdown"
          data-toolbar-item="style"
          style={{ display: isOverflowing('style') ? 'none' : 'inline-block' }}
        >
          <button
            className="toolbar-dropdown-button"
            onClick={() => toggleDropdown('style')}
          >
            <span className="toolbar-dropdown-label">
              {blockType === 'paragraph' ? 'Normal' : blockType.toUpperCase()}
            </span>
            <ChevronDown size={14} />
          </button>
          {openDropdown === 'style' && (
            <div className="toolbar-dropdown-menu">
              <button onClick={formatParagraph} className="toolbar-dropdown-item">
                Normal Text
              </button>
              <button onClick={() => formatHeading('h1')} className="toolbar-dropdown-item">
                <span style={{ fontSize: '18pt', fontWeight: 'bold' }}>Heading 1</span>
              </button>
              <button onClick={() => formatHeading('h2')} className="toolbar-dropdown-item">
                <span style={{ fontSize: '14pt', fontWeight: 'bold' }}>Heading 2</span>
              </button>
              <button onClick={() => formatHeading('h3')} className="toolbar-dropdown-item">
                <span style={{ fontSize: '12pt', fontWeight: 'bold' }}>Heading 3</span>
              </button>
            </div>
          )}
        </div>

        {/* Font Family Dropdown */}
        <div
          className="toolbar-dropdown"
          data-toolbar-item="font-family"
          style={{ display: isOverflowing('font-family') ? 'none' : 'inline-block' }}
        >
          <button
            className="toolbar-dropdown-button"
            onClick={() => toggleDropdown('font')}
          >
            <span className="toolbar-dropdown-label">{fontFamily}</span>
            <ChevronDown size={14} />
          </button>
          {openDropdown === 'font' && (
            <div className="toolbar-dropdown-menu toolbar-dropdown-scrollable">
              {fontFamilies.map((font) => (
                <button
                  key={font}
                  onClick={() => applyFontFamily(font)}
                  className="toolbar-dropdown-item"
                  style={{ fontFamily: font }}
                >
                  {font}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Font Size Dropdown */}
        <div
          className="toolbar-dropdown"
          data-toolbar-item="font-size"
          style={{ display: isOverflowing('font-size') ? 'none' : 'inline-block' }}
        >
          <button
            className="toolbar-dropdown-button"
            onClick={() => toggleDropdown('size')}
          >
            <span className="toolbar-dropdown-label">{fontSize}</span>
            <ChevronDown size={14} />
          </button>
          {openDropdown === 'size' && (
            <div className="toolbar-dropdown-menu">
              {fontSizes.map((size) => (
                <button
                  key={size}
                  onClick={() => applyFontSize(size)}
                  className="toolbar-dropdown-item"
                >
                  {size}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className="toolbar-divider"
          data-toolbar-item="formatting-divider-1"
          style={{ display: isOverflowing('formatting-divider-1') ? 'none' : 'block' }}
        />

        {/* Text Formatting */}
        <div
          className="toolbar-section"
          data-toolbar-item="text-formatting"
          style={{ display: isOverflowing('text-formatting') ? 'none' : 'flex' }}
        >
          <button
            className={`toolbar-button ${isBold ? 'active' : ''}`}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
            title="Bold (Ctrl+B)"
          >
            <Bold size={18} />
          </button>
          <button
            className={`toolbar-button ${isItalic ? 'active' : ''}`}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
            title="Italic (Ctrl+I)"
          >
            <Italic size={18} />
          </button>
          <button
            className={`toolbar-button ${isUnderline ? 'active' : ''}`}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
            title="Underline (Ctrl+U)"
          >
            <Underline size={18} />
          </button>
        </div>

        {/* List Formatting */}
        <div
          className="toolbar-dropdown"
          data-toolbar-item="lists"
          style={{ display: isOverflowing('lists') ? 'none' : 'inline-block' }}
        >
          <button
            className={`toolbar-dropdown-button toolbar-icon-button ${isBulletList || isNumberedList ? 'active' : ''}`}
            onClick={() => toggleDropdown('lists')}
            title="Lists"
          >
            {isBulletList ? <List size={18} /> : isNumberedList ? <ListOrdered size={18} /> : <List size={18} />}
            <ChevronDown size={14} />
          </button>
          {openDropdown === 'lists' && (
            <div className="toolbar-dropdown-menu">
              <button
                onClick={toggleBulletList}
                className={`toolbar-dropdown-item ${isBulletList ? 'active' : ''}`}
              >
                <List size={18} style={{ marginRight: '8px' }} />
                Bullet List
              </button>
              <button
                onClick={toggleNumberedList}
                className={`toolbar-dropdown-item ${isNumberedList ? 'active' : ''}`}
              >
                <ListOrdered size={18} style={{ marginRight: '8px' }} />
                Numbered List
              </button>
            </div>
          )}
        </div>

        {/* Table Insertion */}
        <div
          className="toolbar-dropdown"
          data-toolbar-item="table"
          style={{ display: isOverflowing('table') ? 'none' : 'inline-block' }}
        >
          <button
            className="toolbar-dropdown-button toolbar-icon-button"
            onClick={() => toggleDropdown('table')}
            title="Insert Table"
          >
            <Table size={18} />
            <ChevronDown size={14} />
          </button>
          {openDropdown === 'table' && (
            <div className="toolbar-dropdown-menu table-grid-dropdown">
              <div className="table-grid-header">Insert Table</div>
              <div className="table-grid-selector">
                {Array.from({ length: 8 }, (_, row) => (
                  <div key={row} className="table-grid-row">
                    {Array.from({ length: 10 }, (_, col) => (
                      <div
                        key={col}
                        className="table-grid-cell"
                        onMouseEnter={(e) => {
                          // Highlight cells up to this one
                          const gridCells = e.currentTarget.parentElement?.parentElement?.querySelectorAll('.table-grid-cell');
                          gridCells?.forEach((cell, idx) => {
                            const cellRow = Math.floor(idx / 10);
                            const cellCol = idx % 10;
                            if (cellRow <= row && cellCol <= col) {
                              cell.classList.add('table-grid-cell-hover');
                            } else {
                              cell.classList.remove('table-grid-cell-hover');
                            }
                          });
                          // Update label
                          const label = document.getElementById('table-grid-label');
                          if (label) {
                            label.textContent = `${row + 1} × ${col + 1} Table`;
                          }
                        }}
                        onClick={() => insertTable(row + 1, col + 1)}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div className="table-grid-label" id="table-grid-label">
                1 × 1 Table
              </div>
            </div>
          )}
        </div>

        {/* Text Color and Highlight */}
        <div
          className="toolbar-section"
          data-toolbar-item="colors"
          style={{ display: isOverflowing('colors') ? 'none' : 'flex' }}
        >
            <div className="toolbar-dropdown">
              <button
                className="toolbar-dropdown-button toolbar-icon-button"
                onClick={() => toggleDropdown('textColor')}
                title="Text Color"
              >
                <Palette size={18} />
                <ChevronDown size={14} />
              </button>
              {openDropdown === 'textColor' && (
                <div className="toolbar-dropdown-menu color-picker-menu">
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => applyTextColor(e.target.value)}
                    className="color-picker-input"
                  />
                  <div className="color-presets">
                    {['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'].map(color => (
                      <button
                        key={color}
                        className="color-preset"
                        style={{ backgroundColor: color }}
                        onClick={() => applyTextColor(color)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="toolbar-dropdown">
              <button
                className="toolbar-dropdown-button toolbar-icon-button"
                onClick={() => toggleDropdown('highlight')}
                title="Highlight"
              >
                <Highlighter size={18} />
                <ChevronDown size={14} />
              </button>
              {openDropdown === 'highlight' && (
                <div className="toolbar-dropdown-menu color-picker-menu">
                  <button
                    className="toolbar-dropdown-item"
                    onClick={() => applyHighlight('transparent')}
                  >
                    No Highlight
                  </button>
                  <div className="color-presets">
                    {['#FFFF00', '#00FF00', '#00FFFF', '#FF00FF', '#FFA500', '#FFB6C1'].map(color => (
                      <button
                        key={color}
                        className="color-preset"
                        style={{ backgroundColor: color }}
                        onClick={() => applyHighlight(color)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

        <div
          className="toolbar-divider"
          data-toolbar-item="alignment-divider"
          style={{ display: isOverflowing('alignment-divider') ? 'none' : 'block' }}
        />

        {/* Alignment */}
        <div
          className="toolbar-section"
          data-toolbar-item="alignment"
          style={{ display: isOverflowing('alignment') ? 'none' : 'flex' }}
        >
            <button
              className={`toolbar-button ${textAlign === 'left' ? 'active' : ''}`}
              onClick={() => applyTextAlign('left')}
              title="Align Left"
            >
              <AlignLeft size={18} />
            </button>
            <button
              className={`toolbar-button ${textAlign === 'center' ? 'active' : ''}`}
              onClick={() => applyTextAlign('center')}
              title="Align Center"
            >
              <AlignCenter size={18} />
            </button>
            <button
              className={`toolbar-button ${textAlign === 'right' ? 'active' : ''}`}
              onClick={() => applyTextAlign('right')}
              title="Align Right"
            >
              <AlignRight size={18} />
            </button>
            <button
              className={`toolbar-button ${textAlign === 'justify' ? 'active' : ''}`}
              onClick={() => applyTextAlign('justify')}
              title="Justify"
            >
              <AlignJustify size={18} />
            </button>
          </div>

        {/* Line Spacing */}
        <div
          className="toolbar-dropdown"
          data-toolbar-item="line-spacing"
          style={{ display: isOverflowing('line-spacing') ? 'none' : 'inline-block' }}
        >
          <button
            className="toolbar-dropdown-button toolbar-icon-button"
            onClick={() => toggleDropdown('lineSpacing')}
            title="Line Spacing"
          >
            <AlignVerticalJustifyStart size={18} />
            <ChevronDown size={14} />
          </button>
          {openDropdown === 'lineSpacing' && (
            <div className="toolbar-dropdown-menu">
              {lineSpacings.map((spacing) => (
                <button
                  key={spacing.value}
                  onClick={() => applyLineHeight(spacing.value)}
                  className="toolbar-dropdown-item"
                >
                  {spacing.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className="toolbar-divider"
          data-toolbar-item="ai-divider"
          style={{ display: isOverflowing('ai-divider') ? 'none' : 'block' }}
        />

        {/* AI Assistant */}
        <div
          className="toolbar-section"
          data-toolbar-item="ai-assistant"
          style={{ display: isOverflowing('ai-assistant') ? 'none' : 'flex' }}
        >
          <button
            className="toolbar-button ai-toolbar-button"
            onClick={onAIToggle}
            title="AI Assistant (Ctrl+K)"
          >
            <Sparkles size={18} />
          </button>
        </div>

        {/* More Menu - Always visible */}
        <div className="toolbar-dropdown toolbar-more" data-toolbar-item="more-menu" style={{ marginRight: '8px' }}>
          <button
            className={`toolbar-button toolbar-more-button${isMoreOpen ? ' is-open' : ''}`}
            onClick={toggleMoreMenu}
            title="More tools"
            aria-label="More tools"
            aria-expanded={isMoreOpen}
          >
            <MoreVertical size={18} />
          </button>
          {isMoreOpen && (
            <div className="toolbar-dropdown-menu toolbar-more-menu">
              {/* Overflow Items Section */}
              {overflowItems.size > 0 && (
                <>
                  <div className="toolbar-dropdown-header">
                    <strong>Formatting Options</strong>
                  </div>
                  <div className="toolbar-more-bar overflow-items">
                    {overflowItems.has('style') && (
                      <div className="toolbar-dropdown">
                        <button
                          className="toolbar-dropdown-button"
                          onClick={() => toggleDropdown('style')}
                        >
                          <span className="toolbar-dropdown-label">
                            {blockType === 'paragraph' ? 'Normal' : blockType.toUpperCase()}
                          </span>
                          <ChevronDown size={14} />
                        </button>
                        {openDropdown === 'style' && (
                          <div className="toolbar-dropdown-menu">
                            <button onClick={formatParagraph} className="toolbar-dropdown-item">
                              Normal Text
                            </button>
                            <button onClick={() => formatHeading('h1')} className="toolbar-dropdown-item">
                              <span style={{ fontSize: '18pt', fontWeight: 'bold' }}>Heading 1</span>
                            </button>
                            <button onClick={() => formatHeading('h2')} className="toolbar-dropdown-item">
                              <span style={{ fontSize: '14pt', fontWeight: 'bold' }}>Heading 2</span>
                            </button>
                            <button onClick={() => formatHeading('h3')} className="toolbar-dropdown-item">
                              <span style={{ fontSize: '12pt', fontWeight: 'bold' }}>Heading 3</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {overflowItems.has('font-family') && (
                      <div className="toolbar-dropdown">
                        <button
                          className="toolbar-dropdown-button"
                          onClick={() => toggleDropdown('font')}
                        >
                          <span className="toolbar-dropdown-label">{fontFamily}</span>
                          <ChevronDown size={14} />
                        </button>
                        {openDropdown === 'font' && (
                          <div className="toolbar-dropdown-menu toolbar-dropdown-scrollable">
                            {fontFamilies.map((font) => (
                              <button
                                key={font}
                                onClick={() => applyFontFamily(font)}
                                className="toolbar-dropdown-item"
                                style={{ fontFamily: font }}
                              >
                                {font}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {overflowItems.has('font-size') && (
                      <div className="toolbar-dropdown">
                        <button
                          className="toolbar-dropdown-button"
                          onClick={() => toggleDropdown('size')}
                        >
                          <span className="toolbar-dropdown-label">{fontSize}</span>
                          <ChevronDown size={14} />
                        </button>
                        {openDropdown === 'size' && (
                          <div className="toolbar-dropdown-menu">
                            {fontSizes.map((size) => (
                              <button
                                key={size}
                                onClick={() => applyFontSize(size)}
                                className="toolbar-dropdown-item"
                              >
                                {size}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {overflowItems.has('text-formatting') && (
                      <div className="toolbar-section">
                        <button
                          className={`toolbar-button ${isBold ? 'active' : ''}`}
                          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
                          title="Bold (Ctrl+B)"
                        >
                          <Bold size={18} />
                        </button>
                        <button
                          className={`toolbar-button ${isItalic ? 'active' : ''}`}
                          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
                          title="Italic (Ctrl+I)"
                        >
                          <Italic size={18} />
                        </button>
                        <button
                          className={`toolbar-button ${isUnderline ? 'active' : ''}`}
                          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
                          title="Underline (Ctrl+U)"
                        >
                          <Underline size={18} />
                        </button>
                      </div>
                    )}
                    {overflowItems.has('lists') && (
                      <div className="toolbar-dropdown">
                        <button
                          className={`toolbar-dropdown-button toolbar-icon-button ${isBulletList || isNumberedList ? 'active' : ''}`}
                          onClick={() => toggleDropdown('lists')}
                          title="Lists"
                        >
                          {isBulletList ? <List size={18} /> : isNumberedList ? <ListOrdered size={18} /> : <List size={18} />}
                          <ChevronDown size={14} />
                        </button>
                        {openDropdown === 'lists' && (
                          <div className="toolbar-dropdown-menu">
                            <button
                              onClick={toggleBulletList}
                              className={`toolbar-dropdown-item ${isBulletList ? 'active' : ''}`}
                            >
                              <List size={18} style={{ marginRight: '8px' }} />
                              Bullet List
                            </button>
                            <button
                              onClick={toggleNumberedList}
                              className={`toolbar-dropdown-item ${isNumberedList ? 'active' : ''}`}
                            >
                              <ListOrdered size={18} style={{ marginRight: '8px' }} />
                              Numbered List
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {overflowItems.has('colors') && (
                      <div className="toolbar-section">
                        <div className="toolbar-dropdown">
                          <button
                            className="toolbar-dropdown-button toolbar-icon-button"
                            onClick={() => toggleDropdown('textColor')}
                            title="Text Color"
                          >
                            <Palette size={18} />
                            <ChevronDown size={14} />
                          </button>
                          {openDropdown === 'textColor' && (
                            <div className="toolbar-dropdown-menu color-picker-menu">
                              <input
                                type="color"
                                value={textColor}
                                onChange={(e) => applyTextColor(e.target.value)}
                                className="color-picker-input"
                              />
                              <div className="color-presets">
                                {['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'].map(color => (
                                  <button
                                    key={color}
                                    className="color-preset"
                                    style={{ backgroundColor: color }}
                                    onClick={() => applyTextColor(color)}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="toolbar-dropdown">
                          <button
                            className="toolbar-dropdown-button toolbar-icon-button"
                            onClick={() => toggleDropdown('highlight')}
                            title="Highlight"
                          >
                            <Highlighter size={18} />
                            <ChevronDown size={14} />
                          </button>
                          {openDropdown === 'highlight' && (
                            <div className="toolbar-dropdown-menu color-picker-menu">
                              <button
                                className="toolbar-dropdown-item"
                                onClick={() => applyHighlight('transparent')}
                              >
                                No Highlight
                              </button>
                              <div className="color-presets">
                                {['#FFFF00', '#00FF00', '#00FFFF', '#FF00FF', '#FFA500', '#FFB6C1'].map(color => (
                                  <button
                                    key={color}
                                    className="color-preset"
                                    style={{ backgroundColor: color }}
                                    onClick={() => applyHighlight(color)}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {overflowItems.has('alignment') && (
                      <div className="toolbar-section">
                        <button
                          className={`toolbar-button ${textAlign === 'left' ? 'active' : ''}`}
                          onClick={() => applyTextAlign('left')}
                          title="Align Left"
                        >
                          <AlignLeft size={18} />
                        </button>
                        <button
                          className={`toolbar-button ${textAlign === 'center' ? 'active' : ''}`}
                          onClick={() => applyTextAlign('center')}
                          title="Align Center"
                        >
                          <AlignCenter size={18} />
                        </button>
                        <button
                          className={`toolbar-button ${textAlign === 'right' ? 'active' : ''}`}
                          onClick={() => applyTextAlign('right')}
                          title="Align Right"
                        >
                          <AlignRight size={18} />
                        </button>
                        <button
                          className={`toolbar-button ${textAlign === 'justify' ? 'active' : ''}`}
                          onClick={() => applyTextAlign('justify')}
                          title="Justify"
                        >
                          <AlignJustify size={18} />
                        </button>
                      </div>
                    )}
                    {overflowItems.has('line-spacing') && (
                      <div className="toolbar-dropdown">
                        <button
                          className="toolbar-dropdown-button toolbar-icon-button"
                          onClick={() => toggleDropdown('lineSpacing')}
                          title="Line Spacing"
                        >
                          <AlignVerticalJustifyStart size={18} />
                          <ChevronDown size={14} />
                        </button>
                        {openDropdown === 'lineSpacing' && (
                          <div className="toolbar-dropdown-menu">
                            {lineSpacings.map((spacing) => (
                              <button
                                key={spacing.value}
                                onClick={() => applyLineHeight(spacing.value)}
                                className="toolbar-dropdown-item"
                              >
                                {spacing.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {overflowItems.has('ai-assistant') && (
                      <div className="toolbar-section">
                        <button
                          className="toolbar-button ai-toolbar-button"
                          onClick={onAIToggle}
                          title="AI Assistant (Ctrl+K)"
                        >
                          <Sparkles size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="toolbar-divider" />
                </>
              )}

              {/* Additional Tools Section (always in More menu) */}
              <div className="toolbar-dropdown-header">
                <strong>Additional Tools</strong>
              </div>
              <div className="toolbar-more-bar">
                <div className="toolbar-section">
                <button
                  className={`toolbar-button ${isStrikethrough ? 'active' : ''}`}
                  onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}
                  title="Strikethrough"
                >
                  <Strikethrough size={18} />
                </button>
                <button
                  className={`toolbar-button ${isSubscript ? 'active' : ''}`}
                  onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'subscript')}
                  title="Subscript"
                >
                  <Subscript size={18} />
                </button>
                <button
                  className={`toolbar-button ${isSuperscript ? 'active' : ''}`}
                  onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'superscript')}
                  title="Superscript"
                >
                  <Superscript size={18} />
                </button>
                <button
                  className="toolbar-button"
                  onClick={clearFormatting}
                  title="Clear Formatting"
                >
                  <RemoveFormatting size={18} />
                </button>
              </div>

              <div className="toolbar-divider" />

              <div className="toolbar-section">
                <button
                  className="toolbar-button"
                  onClick={indentDecrease}
                  title="Decrease Indent"
                >
                  <IndentDecrease size={18} />
                </button>
                <button
                  className="toolbar-button"
                  onClick={indentIncrease}
                  title="Increase Indent"
                >
                  <IndentIncrease size={18} />
                </button>
              </div>

              <div className="toolbar-divider" />

              <div className="toolbar-dropdown">
                <button
                  className="toolbar-dropdown-button toolbar-icon-button"
                  onClick={() => toggleDropdown('pageSize')}
                  title="Page Size"
                >
                  <FileText size={18} />
                  <ChevronDown size={14} />
                </button>
                {openDropdown === 'pageSize' && (
                  <div className="toolbar-dropdown-menu">
                    <div className="toolbar-dropdown-header">
                      <strong>Page Size</strong>
                    </div>
                    {[
                      { value: 'letter', label: 'Letter (8.5" × 11")' },
                      { value: 'a4', label: 'A4 (210mm × 297mm)' },
                      { value: 'legal', label: 'Legal (8.5" × 14")' },
                      { value: 'tabloid', label: 'Tabloid (11" × 17")' },
                    ].map((size) => (
                      <button
                        key={size.value}
                        onClick={() => {
                          onPageSizeChange?.(size.value);
                          setOpenDropdown(null);
                        }}
                        className={`toolbar-dropdown-item ${pageSize === size.value ? 'active' : ''}`}
                      >
                        {size.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="toolbar-dropdown">
                <button
                  className="toolbar-dropdown-button toolbar-icon-button"
                  onClick={() => toggleDropdown('margins')}
                  title="Page Margins"
                >
                  <Type size={18} />
                  <ChevronDown size={14} />
                </button>
                {openDropdown === 'margins' && (
                  <div className="toolbar-dropdown-menu margins-dropdown">
                    <div className="margin-control">
                      <label>Top:</label>
                      <input
                        type="number"
                        value={documentMargins.top}
                        onChange={(e) => handleMarginChange('top', Number(e.target.value))}
                        min="36"
                        max="144"
                      />
                      <span>pt</span>
                    </div>
                    <div className="margin-control">
                      <label>Right:</label>
                      <input
                        type="number"
                        value={documentMargins.right}
                        onChange={(e) => handleMarginChange('right', Number(e.target.value))}
                        min="36"
                        max="144"
                      />
                      <span>pt</span>
                    </div>
                    <div className="margin-control">
                      <label>Bottom:</label>
                      <input
                        type="number"
                        value={documentMargins.bottom}
                        onChange={(e) => handleMarginChange('bottom', Number(e.target.value))}
                        min="36"
                        max="144"
                      />
                      <span>pt</span>
                    </div>
                    <div className="margin-control">
                      <label>Left:</label>
                      <input
                        type="number"
                        value={documentMargins.left}
                        onChange={(e) => handleMarginChange('left', Number(e.target.value))}
                        min="36"
                        max="144"
                      />
                      <span>pt</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="toolbar-dropdown">
                <button
                  className="toolbar-dropdown-button toolbar-icon-button"
                  onClick={() => toggleDropdown('format')}
                  title="Format Document"
                >
                  <FileText size={18} />
                  <ChevronDown size={14} />
                </button>
                {openDropdown === 'format' && (
                  <div className="toolbar-dropdown-menu toolbar-dropdown-scrollable format-dropdown">
                    <div className="toolbar-dropdown-header">
                      <strong>Format Document As...</strong>
                    </div>
                    {documentFormats.map((format) => (
                      <button
                        key={format.value}
                        onClick={() => handleFormatSelection(format.value)}
                        className="toolbar-dropdown-item format-item"
                      >
                        <div className="format-label">{format.label}</div>
                        <div className="format-description">{format.description}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="toolbar-divider" />

              <div className="toolbar-section">
                <button
                  className="toolbar-button"
                  onClick={insertEquation}
                  title="Insert Equation"
                >
                  <span style={{ fontFamily: 'serif', fontWeight: 'bold' }}>∑</span>
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
