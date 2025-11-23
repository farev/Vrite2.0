'use client';

import { useState, useCallback, useEffect } from 'react';
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
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
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
}

export default function FormattingToolbar({
  onAIToggle,
  documentMargins = { top: 72, right: 72, bottom: 72, left: 72 },
  onMarginsChange,
  onFormatDocument
}: FormattingToolbarProps) {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [fontSize, setFontSize] = useState('12pt');
  const [fontFamily, setFontFamily] = useState('Times New Roman');
  const [lineHeight, setLineHeight] = useState('1.5');
  const [blockType, setBlockType] = useState('paragraph');
  const [textColor, setTextColor] = useState('#000000');
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  
  // Dropdown states
  const [fontDropdownOpen, setFontDropdownOpen] = useState(false);
  const [sizeDropdownOpen, setSizeDropdownOpen] = useState(false);
  const [lineSpacingDropdownOpen, setLineSpacingDropdownOpen] = useState(false);
  const [styleDropdownOpen, setStyleDropdownOpen] = useState(false);
  const [marginsDropdownOpen, setMarginsDropdownOpen] = useState(false);
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false);
  const [formatDropdownOpen, setFormatDropdownOpen] = useState(false);

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
      
      // Get block type
      const anchorNode = selection.anchor.getNode();
      const element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow();
      const elementDOM = editor.getElementByKey(element.getKey());
      
      if (elementDOM !== null) {
        if ($isHeadingNode(element)) {
          setBlockType(element.getTag());
        } else {
          setBlockType('paragraph');
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

  const formatHeading = (headingSize: HeadingTagType) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createHeadingNode(headingSize));
      }
    });
    setStyleDropdownOpen(false);
  };

  const formatParagraph = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createParagraphNode());
      }
    });
    setStyleDropdownOpen(false);
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
    setSizeDropdownOpen(false);
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
    setFontDropdownOpen(false);
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
    setLineSpacingDropdownOpen(false);
  };

  const handleMarginChange = (side: 'top' | 'right' | 'bottom' | 'left', value: number) => {
    const newMargins = { ...documentMargins, [side]: value };
    onMarginsChange?.(newMargins);
  };

  const handleFormatSelection = (formatType: string) => {
    onFormatDocument?.(formatType);
    setFormatDropdownOpen(false);
  };

  return (
    <div className="formatting-toolbar">
      {/* Style Dropdown */}
      <div className="toolbar-dropdown">
        <button
          className="toolbar-dropdown-button"
          onClick={() => setStyleDropdownOpen(!styleDropdownOpen)}
        >
          <span className="toolbar-dropdown-label">
            {blockType === 'paragraph' ? 'Normal' : blockType.toUpperCase()}
          </span>
          <ChevronDown size={14} />
        </button>
        {styleDropdownOpen && (
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
          onClick={() => setFontDropdownOpen(!fontDropdownOpen)}
        >
          <span className="toolbar-dropdown-label">{fontFamily}</span>
          <ChevronDown size={14} />
        </button>
        {fontDropdownOpen && (
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
          onClick={() => setSizeDropdownOpen(!sizeDropdownOpen)}
        >
          <span className="toolbar-dropdown-label">{fontSize}</span>
          <ChevronDown size={14} />
        </button>
        {sizeDropdownOpen && (
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

      <div className="toolbar-divider" />

      {/* Alignment */}
      <div className="toolbar-section">
        <button className="toolbar-button" title="Align Left">
          <AlignLeft size={18} />
        </button>
        <button className="toolbar-button" title="Align Center">
          <AlignCenter size={18} />
        </button>
        <button className="toolbar-button" title="Align Right">
          <AlignRight size={18} />
        </button>
        <button className="toolbar-button" title="Justify">
          <AlignJustify size={18} />
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Line Spacing */}
      <div className="toolbar-dropdown">
        <button
          className="toolbar-dropdown-button"
          onClick={() => setLineSpacingDropdownOpen(!lineSpacingDropdownOpen)}
          title="Line Spacing"
        >
          <AlignVerticalJustifyStart size={18} />
          <ChevronDown size={14} />
        </button>
        {lineSpacingDropdownOpen && (
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

      {/* Margins */}
      <div className="toolbar-dropdown">
        <button
          className="toolbar-dropdown-button"
          onClick={() => setMarginsDropdownOpen(!marginsDropdownOpen)}
          title="Page Margins"
        >
          <Type size={18} />
          <ChevronDown size={14} />
        </button>
        {marginsDropdownOpen && (
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

      {/* Document Format */}
      <div className="toolbar-dropdown">
        <button
          className="toolbar-dropdown-button"
          onClick={() => setFormatDropdownOpen(!formatDropdownOpen)}
          title="Format Document"
        >
          <FileText size={18} />
          <ChevronDown size={14} />
        </button>
        {formatDropdownOpen && (
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
  );
}