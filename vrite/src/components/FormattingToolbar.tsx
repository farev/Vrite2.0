'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  $getNodeByKey,
} from 'lexical';
import {
  $createHeadingNode,
  $createQuoteNode,
  HeadingTagType,
  $isHeadingNode,
} from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { $createParagraphNode, $isTextNode } from 'lexical';
import {
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
  ListNode,
} from '@lexical/list';
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
  const [lineHeight, setLineHeight] = useState('1.5');
  const [blockType, setBlockType] = useState('paragraph');
  const [textColor, setTextColor] = useState('#000000');
  const [highlightColor, setHighlightColor] = useState('transparent');
  const [textAlign, setTextAlign] = useState('left');

  // Dropdown states - only one can be open at a time
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // Ref for click-outside detection
  const toolbarRef = useRef<HTMLDivElement>(null);

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
      const elementDOM = editor.getElementByKey(element.getKey());

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

      if (elementDOM !== null) {
        if ($isHeadingNode(element)) {
          setBlockType(element.getTag());
        } else {
          setBlockType('paragraph');
        }

        // Get text alignment from element
        const align = elementDOM.style.textAlign || 'left';
        setTextAlign(align);
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

  const applyFontSize = (size: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const nodes = selection.getNodes();
        nodes.forEach((node) => {
          if ($isTextNode(node)) {
            node.setStyle(`font-size: ${size};`);
          }
        });
      }
    });
    setFontSize(size);
    setOpenDropdown(null);
  };

  const applyFontFamily = (family: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const nodes = selection.getNodes();
        nodes.forEach((node) => {
          if ($isTextNode(node)) {
            node.setStyle(`font-family: "${family}";`);
          }
        });
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
    setLineHeight(height);
    setOpenDropdown(null);
  };

  const applyTextAlign = (align: 'left' | 'center' | 'right' | 'justify') => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        const element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow();
        if (element) {
          const elementDOM = editor.getElementByKey(element.getKey());
          if (elementDOM) {
            elementDOM.style.textAlign = align;
          }
        }
      }
    });
    setTextAlign(align);
  };

  const applyTextColor = (color: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const nodes = selection.getNodes();
        nodes.forEach((node) => {
          if ($isTextNode(node)) {
            const currentStyle = node.getStyle();
            const newStyle = currentStyle
              ? `${currentStyle}; color: ${color}`
              : `color: ${color}`;
            node.setStyle(newStyle);
          }
        });
      }
    });
    setTextColor(color);
    setOpenDropdown(null);
  };

  const applyHighlight = (color: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const nodes = selection.getNodes();
        nodes.forEach((node) => {
          if ($isTextNode(node)) {
            const currentStyle = node.getStyle();
            const newStyle = currentStyle
              ? `${currentStyle}; background-color: ${color}`
              : `background-color: ${color}`;
            node.setStyle(newStyle);
          }
        });
      }
    });
    setHighlightColor(color);
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
        const equationNode = $createEquationNode('E = mc^2', true);
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

  const toggleDropdown = (dropdown: string, closeMore = false) => {
    setOpenDropdown((prev) => (prev === dropdown ? null : dropdown));
    if (closeMore) {
      setIsMoreOpen(false);
    }
  };

  const toggleMoreMenu = () => {
    setIsMoreOpen((prev) => !prev);
    setOpenDropdown(null);
  };

  return (
    <div className="formatting-toolbar" ref={toolbarRef}>
      <div className="formatting-toolbar-main">
        {/* Style Dropdown */}
        <div className="toolbar-dropdown">
          <button
            className="toolbar-dropdown-button"
            onClick={() => toggleDropdown('style', true)}
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
        <div className="toolbar-dropdown">
          <button
            className="toolbar-dropdown-button"
            onClick={() => toggleDropdown('font', true)}
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
        <div className="toolbar-dropdown">
          <button
            className="toolbar-dropdown-button"
            onClick={() => toggleDropdown('size', true)}
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

        <div className="toolbar-divider" />

        {/* Text Formatting */}
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

        {/* List Formatting */}
        <div className="toolbar-dropdown">
          <button
            className={`toolbar-dropdown-button toolbar-icon-button ${isBulletList || isNumberedList ? 'active' : ''}`}
            onClick={() => toggleDropdown('lists', true)}
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

        {/* Text Color and Highlight */}
        <div className="toolbar-section">
          <div className="toolbar-dropdown">
            <button
              className="toolbar-dropdown-button toolbar-icon-button"
              onClick={() => toggleDropdown('textColor', true)}
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
              onClick={() => toggleDropdown('highlight', true)}
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

        <div className="toolbar-divider" />

        {/* Alignment */}
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

        {/* Line Spacing */}
        <div className="toolbar-dropdown">
          <button
            className="toolbar-dropdown-button toolbar-icon-button"
            onClick={() => toggleDropdown('lineSpacing', true)}
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

        <div className="toolbar-divider" />

        {/* Undo/Redo */}
        <div className="toolbar-section">
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

        <div className="toolbar-divider" />

        {/* AI Assistant */}
        <div className="toolbar-section">
          <button
            className="toolbar-button ai-toolbar-button"
            onClick={onAIToggle}
            title="AI Assistant (Ctrl+K)"
          >
            <Sparkles size={18} />
          </button>
        </div>
      </div>

      <div className="toolbar-dropdown toolbar-more">
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
  );
}
