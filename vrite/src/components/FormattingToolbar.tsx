'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  ElementFormatType,
  $isElementNode,
  ElementNode,
  TextNode,
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
import type { LexicalEditor } from 'lexical';
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
  Plus,
  Pipette,
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
  activeEditor?: LexicalEditor | null;
}

const TEXT_COLOR_SWATCHES = [
  // Grayscale ramp (black to white)
  '#000000', '#3F3F46', '#52525B', '#71717A', '#A1A1AA', '#D4D4D8', '#E5E7EB', '#FFFFFF',
  // Bright base hues
  '#D93025', '#F97316', '#FACC15', '#34A853', '#14B8A6', '#4285F4', '#7C3AED', '#D946EF',
  // Light hues
  '#F28B82', '#FDBA74', '#FDE68A', '#86EFAC', '#99F6E4', '#93C5FD', '#C4B5FD', '#F5B4FC',
  // Medium/deep hues
  '#C5221F', '#EA580C', '#D4A514', '#15803D', '#0F766E', '#1D4ED8', '#6D28D9', '#BE185D',
  // Dark hues
  '#8B1D18', '#9A3412', '#A16207', '#166534', '#115E59', '#1E3A8A', '#4C1D95', '#831843'
];

const normalizeHex = (value: string) => {
  const cleaned = value.trim().replace('#', '');
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    return `#${cleaned.split('').map((char) => char + char).join('').toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned.toLowerCase()}`;
  }
  return null;
};

const rgbToHex = (value: string) => {
  const match = value.match(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i);
  if (!match) return null;

  const [r, g, b] = match.slice(1, 4).map((channel) => {
    const numeric = Number(channel);
    return Number.isNaN(numeric) ? 0 : Math.max(0, Math.min(255, numeric));
  });

  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

const normalizeColorToHex = (value: string) => {
  const hex = normalizeHex(value);
  if (hex) return hex;

  const rgbHex = rgbToHex(value);
  if (rgbHex) return rgbHex;

  if (typeof window === 'undefined') return null;

  const probe = document.createElement('span');
  probe.style.color = value;

  if (!probe.style.color) return null;

  const resolved = probe.style.color;
  return rgbToHex(resolved) || normalizeHex(resolved);
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const hexToRgb = (hex: string) => {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const value = normalized.slice(1);
  const int = parseInt(value, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
};

const rgbToHsv = (r: number, g: number, b: number) => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : (delta / max) * 100;
  const v = max * 100;
  return { h, s, v };
};

const hsvToRgb = (h: number, s: number, v: number) => {
  const sat = clamp(s, 0, 100) / 100;
  const val = clamp(v, 0, 100) / 100;
  const c = val * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = val - c;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 60) [r, g, b] = [c, x, 0];
  else if (h >= 60 && h < 120) [r, g, b] = [x, c, 0];
  else if (h >= 120 && h < 180) [r, g, b] = [0, c, x];
  else if (h >= 180 && h < 240) [r, g, b] = [0, x, c];
  else if (h >= 240 && h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
};

const hsvToHex = (h: number, s: number, v: number) => {
  const { r, g, b } = hsvToRgb(h, s, v);
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

export default function FormattingToolbar({
  onAIToggle,
  documentMargins = { top: 72, right: 72, bottom: 72, left: 72 },
  onMarginsChange,
  onFormatDocument,
  pageSize = 'letter',
  onPageSizeChange,
  activeEditor: activeEditorProp,
}: FormattingToolbarProps) {
  const [mainEditor] = useLexicalComposerContext();
  const editor = activeEditorProp || mainEditor;
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
  const [textColorInput, setTextColorInput] = useState('#000000');
  const [highlightColor, setHighlightColor] = useState('transparent');
  const [highlightColorInput, setHighlightColorInput] = useState('#ffff00');
  const [isCustomColorPickerOpen, setIsCustomColorPickerOpen] = useState(false);
  const [customColorPickerMode, setCustomColorPickerMode] = useState<'text' | 'highlight'>('text');
  const [customColorPopupPosition, setCustomColorPopupPosition] = useState({ top: 0, left: 0 });
  const [customHue, setCustomHue] = useState(0);
  const [customSaturation, setCustomSaturation] = useState(100);
  const [customValue, setCustomValue] = useState(100);
  const [textAlign, setTextAlign] = useState('left');

  // Dropdown states - only one can be open at a time
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // Refs for click-outside detection and overflow calculation
  const toolbarRef = useRef<HTMLDivElement>(null);
  const mainToolbarRef = useRef<HTMLDivElement>(null);
  const customColorPanelRef = useRef<HTMLDivElement>(null);
  const customColorPopupRef = useRef<HTMLDivElement>(null);
  const textColorCustomButtonRef = useRef<HTMLButtonElement>(null);
  const highlightColorCustomButtonRef = useRef<HTMLButtonElement>(null);
  const textColorTriggerButtonRef = useRef<HTMLButtonElement>(null);
  const highlightTriggerButtonRef = useRef<HTMLButtonElement>(null);

  // Track which items are overflowing
  const [overflowItems, setOverflowItems] = useState<Set<string>>(new Set());
  const [toolbarWidth, setToolbarWidth] = useState<number | null>(null);

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
    editor.getEditorState().read(() => {
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
          const colorMatch = style.match(/(?:^|;)\s*color:\s*([^;]+)/);
          if (colorMatch) {
            setTextColor(normalizeColorToHex(colorMatch[1].trim()) || '#000000');
          } else {
            setTextColor('#000000'); // Default
          }

          // Parse highlight color
          const highlightMatch = style.match(/(?:^|;)\s*background-color:\s*([^;]+)/);
          if (highlightMatch) {
            const rawHighlight = highlightMatch[1].trim();
            if (rawHighlight === 'transparent') {
              setHighlightColor('transparent');
            } else {
              setHighlightColor(normalizeColorToHex(rawHighlight) || 'transparent');
            }
          } else {
            setHighlightColor('transparent');
          }
        } else {
          // No style, use defaults
          setFontFamily('Times New Roman');
          setFontSize('12pt');
          setTextColor('#000000');
          setHighlightColor('transparent');
        }
      }
    });
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
      const target = event.target as Node;
      const clickedInsideToolbar = toolbarRef.current?.contains(target);
      const clickedInsideCustomPopup = customColorPopupRef.current?.contains(target);

      if (!clickedInsideToolbar && !clickedInsideCustomPopup) {
        setOpenDropdown(null);
        setIsMoreOpen(false);
        setIsCustomColorPickerOpen(false);
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

    const getOuterWidth = (element: HTMLElement) => {
      const computedStyle = window.getComputedStyle(element);
      const marginLeft = parseFloat(computedStyle.marginLeft) || 0;
      const marginRight = parseFloat(computedStyle.marginRight) || 0;
      return element.offsetWidth + marginLeft + marginRight;
    };

    const calculateOverflow = () => {
      const toolbarParent = toolbar.parentElement;
      const maxOuterWidth = Math.max(
        0,
        (toolbarParent?.clientWidth ?? window.innerWidth) - 28
      );

      const toolbarComputed = window.getComputedStyle(toolbar);
      const toolbarInset =
        (parseFloat(toolbarComputed.paddingLeft) || 0) +
        (parseFloat(toolbarComputed.paddingRight) || 0) +
        (parseFloat(toolbarComputed.borderLeftWidth) || 0) +
        (parseFloat(toolbarComputed.borderRightWidth) || 0);

      const maxMainWidth = Math.max(0, maxOuterWidth - toolbarInset);
      if (maxMainWidth <= 0) {
        return;
      }

      const toolbarStyle = window.getComputedStyle(mainToolbar);
      const gap = parseFloat(toolbarStyle.columnGap || toolbarStyle.gap || '0') || 0;
      const children = Array.from(mainToolbar.children) as HTMLElement[];

      const moreMenuItem = children.find(
        (child) => child.getAttribute('data-toolbar-item') === 'more-menu'
      );
      const reservedMoreWidth = moreMenuItem ? getOuterWidth(moreMenuItem) + gap : 0;
      const availableWidth = Math.max(0, maxMainWidth - reservedMoreWidth);

      let usedWidth = 0;
      const newOverflowItems = new Set<string>();

      // Build array of items with their actual widths
      const items: { id: string; width: number }[] = [];

      children.forEach((child) => {
        const itemId = child.getAttribute('data-toolbar-item');
        if (!itemId) return;

        // Skip the more menu button - it's always visible
        if (itemId === 'more-menu') return;

        // Temporarily make visible to measure
        const currentDisplay = (child as HTMLElement).style.display;
        (child as HTMLElement).style.display = '';

        const childWidth = getOuterWidth(child) + gap;

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
          items.push({ id: itemId, width: childWidth });
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

      const finalMainWidth = Math.min(maxMainWidth, usedWidth + reservedMoreWidth);
      const finalToolbarWidth = Math.min(
        maxOuterWidth,
        Math.max(finalMainWidth + toolbarInset, reservedMoreWidth + toolbarInset)
      );

      setToolbarWidth((prev) => {
        if (prev === null || Math.abs(prev - finalToolbarWidth) > 1) {
          return finalToolbarWidth;
        }
        return prev;
      });

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
    resizeObserver.observe(mainToolbar);

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

  const stepFontSize = (direction: 'up' | 'down') => {
    const parsed = parseFloat(fontSize);
    const current = Number.isFinite(parsed) ? parsed : 12;
    const next = direction === 'up'
      ? Math.min(72, current + 1)
      : Math.max(1, current - 1);
    applyFontSize(`${next}pt`);
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

  const setTextColorValue = (color: string, closeDropdown = true) => {
    const normalizedColor = normalizeColorToHex(color) || '#000000';
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, { 'color': normalizedColor });
      }
    });
    setTextColor(normalizedColor);
    setTextColorInput(normalizedColor);
    if (closeDropdown) {
      setOpenDropdown(null);
      setIsCustomColorPickerOpen(false);
    }
  };

  const applyTextColor = (color: string) => {
    setTextColorValue(color, true);
  };

  const setHighlightColorValue = (color: string, closeDropdown = true) => {
    const normalizedColor = color === 'transparent'
      ? 'transparent'
      : normalizeColorToHex(color) || '#ffff00';

    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $patchStyleText(selection, { 'background-color': normalizedColor });
      }
    });

    setHighlightColor(normalizedColor);
    if (normalizedColor !== 'transparent') {
      setHighlightColorInput(normalizedColor);
    }
    if (closeDropdown) {
      setOpenDropdown(null);
      setIsCustomColorPickerOpen(false);
    }
  };

  const applyHighlight = (color: string) => {
    setHighlightColorValue(color, true);
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


  const handleMarginChange = (side: 'top' | 'right' | 'bottom' | 'left', value: number) => {
    const newMargins = { ...documentMargins, [side]: value };
    onMarginsChange?.(newMargins);
  };

  const handleFormatSelection = (formatType: string) => {
    onFormatDocument?.(formatType);
    setOpenDropdown(null);
  };

  const toggleDropdown = (dropdown: string) => {
    setIsCustomColorPickerOpen(false);
    setOpenDropdown((prev) => (prev === dropdown ? null : dropdown));
  };

  const toggleMoreMenu = () => {
    setIsMoreOpen((prev) => !prev);
    setOpenDropdown(null);
  };

  const syncCustomPickerFromColor = (color: string) => {
    const rgb = hexToRgb(color);
    if (!rgb) return;
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    setCustomHue(hsv.h);
    setCustomSaturation(hsv.s);
    setCustomValue(hsv.v);
  };

  const handleCustomColorToggle = (mode: 'text' | 'highlight') => {
    if (isCustomColorPickerOpen) {
      setIsCustomColorPickerOpen(false);
      return;
    }

    const triggerRect = mode === 'text'
      ? textColorCustomButtonRef.current?.getBoundingClientRect()
      : highlightColorCustomButtonRef.current?.getBoundingClientRect();
    const colorTriggerRect = mode === 'text'
      ? textColorTriggerButtonRef.current?.getBoundingClientRect()
      : highlightTriggerButtonRef.current?.getBoundingClientRect();
    const popupWidth = 420;
    const popupHeight = 300;
    const dropdownWidthEstimate = 238;
    const margin = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const left = colorTriggerRect
      ? clamp(
          colorTriggerRect.left + dropdownWidthEstimate + 12,
          margin,
          viewportWidth - popupWidth - margin
        )
      : Math.max(margin, viewportWidth - popupWidth - margin);
    const top = colorTriggerRect
      ? clamp(colorTriggerRect.bottom + 2, margin, viewportHeight - popupHeight - margin)
      : triggerRect
      ? clamp(triggerRect.top - 20, margin, viewportHeight - popupHeight - margin)
      : margin;

    setCustomColorPickerMode(mode);
    setCustomColorPopupPosition({ top, left });
    if (mode === 'text') {
      syncCustomPickerFromColor(textColor);
      setTextColorInput(textColor);
    } else {
      const startColor = highlightColor === 'transparent' ? '#ffff00' : highlightColor;
      syncCustomPickerFromColor(startColor);
      setHighlightColorInput(startColor);
    }
    setIsCustomColorPickerOpen(true);
    setOpenDropdown(null);
  };

  const applyCustomPickerColor = (hue: number, saturation: number, value: number, mode: 'text' | 'highlight') => {
    const color = hsvToHex(hue, saturation, value);
    if (mode === 'text') {
      setTextColorValue(color, false);
    } else {
      setHighlightColorValue(color, false);
    }
  };

  const updateCustomSaturationValue = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panel = customColorPanelRef.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const y = clamp(event.clientY - rect.top, 0, rect.height);

    const saturation = (x / rect.width) * 100;
    const value = 100 - (y / rect.height) * 100;

    setCustomSaturation(saturation);
    setCustomValue(value);
    applyCustomPickerColor(customHue, saturation, value, customColorPickerMode);
  };

  const handleHexCommit = (mode: 'text' | 'highlight') => {
    const currentInput = mode === 'text' ? textColorInput : highlightColorInput;
    const normalized = normalizeColorToHex(currentInput);
    if (!normalized) {
      if (mode === 'text') {
        setTextColorInput(textColor);
      } else {
        setHighlightColorInput(highlightColor === 'transparent' ? '#ffff00' : highlightColor);
      }
      return;
    }

    if (mode === 'text') {
      setTextColorValue(normalized, false);
    } else {
      setHighlightColorValue(normalized, false);
    }
    syncCustomPickerFromColor(normalized);
  };

  const handleEyeDropper = async () => {
    type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };
    const eyeDropper = (window as Window & { EyeDropper?: EyeDropperCtor }).EyeDropper;
    if (!eyeDropper) return;

    try {
      const result = await new eyeDropper().open();
      const normalized = normalizeColorToHex(result.sRGBHex);
      if (!normalized) return;
      if (customColorPickerMode === 'text') {
        setTextColorValue(normalized, false);
      } else {
        setHighlightColorValue(normalized, false);
      }
      syncCustomPickerFromColor(normalized);
    } catch {
      // User canceled the eyedropper.
    }
  };

  const renderTextColorControl = () => (
    <div className="toolbar-dropdown">
      <button
        ref={textColorTriggerButtonRef}
        className="toolbar-dropdown-button toolbar-icon-button text-color-button"
        onClick={() => {
          setTextColorInput(textColor);
          setIsCustomColorPickerOpen(false);
          toggleDropdown('textColor');
        }}
        title="Text Color"
        aria-label="Text color"
      >
        <span className="text-color-trigger" aria-hidden="true">
          <span className="text-color-trigger-letter" style={{ color: textColor }}>A</span>
        </span>      </button>
      {openDropdown === 'textColor' && (
        <div className="toolbar-dropdown-menu text-color-menu">
          <div className="text-color-menu-header">
            <span>Text color</span>
            <span className="text-color-menu-current">{textColor.toUpperCase()}</span>
          </div>
          <div className="text-color-input-row">
            <input
              type="text"
              value={textColorInput}
              onChange={(event) => setTextColorInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleHexCommit('text');
                }
              }}
              onBlur={() => handleHexCommit('text')}
              className="text-color-text-input"
              placeholder='Try "blue" or "#00c4cc"'
              aria-label="Color value"
            />
            <button
              type="button"
              ref={textColorCustomButtonRef}
              className="text-color-custom-button"
              onClick={() => handleCustomColorToggle('text')}
              aria-label="Add custom color"
              title="Custom color"
            >
              <span className="text-color-custom-inner">
                <Plus size={16} />
              </span>
            </button>
          </div>
          <div className="text-color-swatches" role="listbox" aria-label="Color swatches">
            {TEXT_COLOR_SWATCHES.map((color) => {
              const isActive = textColor.toLowerCase() === color.toLowerCase();
              return (
                <button
                  key={color}
                  className={`text-color-swatch${isActive ? ' is-active' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => applyTextColor(color)}
                  title={color}
                  aria-label={`Set text color ${color}`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const renderHighlightColorControl = () => (
    <div className="toolbar-dropdown">
      <button
        ref={highlightTriggerButtonRef}
        className="toolbar-dropdown-button toolbar-icon-button text-color-button"
        onClick={() => {
          setHighlightColorInput(highlightColor === 'transparent' ? '#ffff00' : highlightColor);
          setIsCustomColorPickerOpen(false);
          toggleDropdown('highlight');
        }}
        title="Highlight"
        aria-label="Highlight color"
      >
        <span className="text-color-trigger" aria-hidden="true">
          <Highlighter size={18} color={highlightColor === 'transparent' ? '#0f172a' : highlightColor} />
        </span>
      </button>
      {openDropdown === 'highlight' && (
        <div className="toolbar-dropdown-menu text-color-menu">
          <div className="text-color-menu-header">
            <span>Highlight color</span>
            <span className="text-color-menu-current">
              {highlightColor === 'transparent' ? 'NONE' : highlightColor.toUpperCase()}
            </span>
          </div>
          <div className="text-color-input-row">
            <input
              type="text"
              value={highlightColorInput}
              onChange={(event) => setHighlightColorInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleHexCommit('highlight');
                }
              }}
              onBlur={() => handleHexCommit('highlight')}
              className="text-color-text-input"
              placeholder='Try "yellow" or "#fff176"'
              aria-label="Highlight color value"
            />
            <button
              type="button"
              ref={highlightColorCustomButtonRef}
              className="text-color-custom-button"
              onClick={() => handleCustomColorToggle('highlight')}
              aria-label="Add custom highlight color"
              title="Custom highlight color"
            >
              <span className="text-color-custom-inner">
                <Plus size={16} />
              </span>
            </button>
          </div>
          <button
            className="toolbar-dropdown-item"
            onClick={() => applyHighlight('transparent')}
          >
            No Highlight
          </button>
          <div className="text-color-swatches" role="listbox" aria-label="Highlight swatches">
            {TEXT_COLOR_SWATCHES.map((color) => {
              const isActive = highlightColor.toLowerCase() === color.toLowerCase();
              return (
                <button
                  key={color}
                  className={`text-color-swatch${isActive ? ' is-active' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => applyHighlight(color)}
                  title={color}
                  aria-label={`Set highlight color ${color}`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  // Helper function to check if an item should be hidden (overflow)
  const isOverflowing = (itemId: string) => overflowItems.has(itemId);

  const customColorPopup = isCustomColorPickerOpen && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={customColorPopupRef}
          className="text-color-custom-popup"
          style={{ top: customColorPopupPosition.top, left: customColorPopupPosition.left }}
        >
          <div
            ref={customColorPanelRef}
            className="custom-color-saturation"
            style={{ backgroundColor: `hsl(${customHue}, 100%, 50%)` }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              updateCustomSaturationValue(event);
            }}
            onPointerMove={(event) => {
              if (event.buttons === 1) {
                updateCustomSaturationValue(event);
              }
            }}
          >
            <div className="custom-color-saturation-white" />
            <div className="custom-color-saturation-black" />
            <span
              className="custom-color-saturation-thumb"
              style={{
                left: `${customSaturation}%`,
                top: `${100 - customValue}%`,
              }}
            />
          </div>
          <div className="custom-color-hue-row">
            <input
              type="range"
              min={0}
              max={360}
              value={customHue}
              className="custom-color-hue-slider"
              onChange={(event) => {
                const hue = Number(event.target.value);
                setCustomHue(hue);
                applyCustomPickerColor(hue, customSaturation, customValue, customColorPickerMode);
              }}
            />
          </div>
          <div className="custom-color-footer">
            <div className="custom-color-hex-chip">
              <span
                className="custom-color-hex-dot"
                style={{
                  backgroundColor: customColorPickerMode === 'text'
                    ? textColor
                    : (highlightColor === 'transparent' ? '#ffff00' : highlightColor),
                }}
              />
              <input
                type="text"
                value={customColorPickerMode === 'text' ? textColorInput : highlightColorInput}
                onChange={(event) => {
                  if (customColorPickerMode === 'text') {
                    setTextColorInput(event.target.value);
                  } else {
                    setHighlightColorInput(event.target.value);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleHexCommit(customColorPickerMode);
                  }
                }}
                onBlur={() => handleHexCommit(customColorPickerMode)}
                className="custom-color-hex-input"
                aria-label="Hex color"
              />
            </div>
            <button
              type="button"
              className="custom-color-eyedropper"
              onClick={handleEyeDropper}
              aria-label="Eyedropper"
              title="Eyedropper"
            >
              <Pipette size={18} />
            </button>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
    <div
      className="formatting-toolbar"
      ref={toolbarRef}
      onMouseDown={(e) => {
        // Prevent toolbar clicks from stealing focus from header/footer editors
        e.preventDefault();
      }}
      style={toolbarWidth !== null ? { width: `${toolbarWidth}px` } : undefined}
    >
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
            className="toolbar-dropdown-button toolbar-modern-field toolbar-modern-style"
            onClick={() => toggleDropdown('style')}
          >
            <span className="toolbar-dropdown-label">
              {blockType === 'paragraph' ? 'Normal' : blockType.toUpperCase()}
            </span>          </button>
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
            className="toolbar-dropdown-button toolbar-modern-field toolbar-modern-font"
            onClick={() => toggleDropdown('font')}
          >
            <span className="toolbar-dropdown-label toolbar-font-family-label">
              {fontFamily}
            </span>
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
            className="toolbar-dropdown-button toolbar-modern-field toolbar-modern-size"
            onClick={() => toggleDropdown('size')}
          >
            <span
              className="toolbar-modern-size-step"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                stepFontSize('down');
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              role="button"
              aria-label="Decrease font size"
            >
              -
            </span>
            <span className="toolbar-dropdown-label toolbar-modern-size-value">{fontSize}</span>
            <span
              className="toolbar-modern-size-step"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                stepFontSize('up');
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              role="button"
              aria-label="Increase font size"
            >
              +
            </span>
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
            {isBulletList ? <List size={18} /> : isNumberedList ? <ListOrdered size={18} /> : <List size={18} />}          </button>
          {openDropdown === 'lists' && (
            <div className="toolbar-dropdown-menu toolbar-list-menu">
              <button
                onClick={toggleBulletList}
                className={`toolbar-dropdown-item toolbar-dropdown-item-icon-only ${isBulletList ? 'active' : ''}`}
                aria-label="Bullet List"
                title="Bullet List"
              >
                <List size={18} />
              </button>
              <button
                onClick={toggleNumberedList}
                className={`toolbar-dropdown-item toolbar-dropdown-item-icon-only ${isNumberedList ? 'active' : ''}`}
                aria-label="Numbered List"
                title="Numbered List"
              >
                <ListOrdered size={18} />
              </button>
            </div>
          )}
        </div>

        {/* Text Color and Highlight */}
        <div
          className="toolbar-section"
          data-toolbar-item="colors"
          style={{ display: isOverflowing('colors') ? 'none' : 'flex' }}
        >
            {renderTextColorControl()}
            {renderHighlightColorControl()}
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
            <AlignVerticalJustifyStart size={18} />          </button>
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
                          className="toolbar-dropdown-button toolbar-modern-field toolbar-modern-style"
                          onClick={() => toggleDropdown('style')}
                        >
                          <span className="toolbar-dropdown-label">
                            {blockType === 'paragraph' ? 'Normal' : blockType.toUpperCase()}
                          </span>                        </button>
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
                          className="toolbar-dropdown-button toolbar-modern-field toolbar-modern-font"
                          onClick={() => toggleDropdown('font')}
                        >
                          <span className="toolbar-dropdown-label toolbar-font-family-label">
                            {fontFamily}
                          </span>
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
                          className="toolbar-dropdown-button toolbar-modern-field toolbar-modern-size"
                          onClick={() => toggleDropdown('size')}
                        >
                          <span
                            className="toolbar-modern-size-step"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              stepFontSize('down');
                            }}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            role="button"
                            aria-label="Decrease font size"
                          >
                            -
                          </span>
                          <span className="toolbar-dropdown-label toolbar-modern-size-value">{fontSize}</span>
                          <span
                            className="toolbar-modern-size-step"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              stepFontSize('up');
                            }}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            role="button"
                            aria-label="Increase font size"
                          >
                            +
                          </span>
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
                          {isBulletList ? <List size={18} /> : isNumberedList ? <ListOrdered size={18} /> : <List size={18} />}                        </button>
                        {openDropdown === 'lists' && (
                          <div className="toolbar-dropdown-menu toolbar-list-menu">
                            <button
                              onClick={toggleBulletList}
                              className={`toolbar-dropdown-item toolbar-dropdown-item-icon-only ${isBulletList ? 'active' : ''}`}
                              aria-label="Bullet List"
                              title="Bullet List"
                            >
                              <List size={18} />
                            </button>
                            <button
                              onClick={toggleNumberedList}
                              className={`toolbar-dropdown-item toolbar-dropdown-item-icon-only ${isNumberedList ? 'active' : ''}`}
                              aria-label="Numbered List"
                              title="Numbered List"
                            >
                              <ListOrdered size={18} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {overflowItems.has('colors') && (
                      <div className="toolbar-section">
                        {renderTextColorControl()}
                        {renderHighlightColorControl()}
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
                          <AlignVerticalJustifyStart size={18} />                        </button>
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
                  <FileText size={18} />                </button>
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
                  <Type size={18} />                </button>
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
                  <FileText size={18} />                </button>
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
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
    {customColorPopup}
    </>
  );
}
