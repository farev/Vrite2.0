'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowUp,
  Sparkles,
  X,
  Plus,
  Copy,
  Check,
  Pencil,
  Paperclip,
  AtSign
} from 'lucide-react';
import type { SimplifiedDocument } from '@/lib/lexicalSerializer';
import type { LexicalChange } from '@/lib/lexicalChangeApplicator';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { compressImageToBase64 } from './nodes/ImageNode';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  isStreaming?: boolean;
  images?: Array<{ filename: string; data: string; width: number; height: number }>;
}

// Helper component to format message content with special styling for tool usage
function FormattedMessageContent({ content }: { content: string }) {
  // Split content by tool usage pattern
  const parts = content.split(/(Using \w+[\w_-]* tool\.\.\.|Edited document)/g);

  return (
    <>
      {parts.map((part, index) => {
        // Check if this part is a tool usage message
        if (part === 'Edited document') {
          return (
            <span key={index} className="ai-tool-usage">
              <Pencil size={14} />
              Edited document
            </span>
          );
        }

        const toolMatch = part.match(/Using (\w+[\w_-]*) tool\.\.\./);
        if (toolMatch) {
          const toolName = toolMatch[1];
          return (
            <span key={index} className="ai-tool-usage">
              {toolName === 'edit_document' && (
                <Pencil size={14} />
              )}
              Using <strong>{toolName}</strong> tool...
            </span>
          );
        }
        // Regular content - preserve line breaks
        return part.split('\n').map((line, i, arr) => (
          <span key={`${index}-${i}`}>
            {line}
            {i < arr.length - 1 && <br />}
          </span>
        ));
      })}
    </>
  );
}

export interface ContextSnippet {
  id: string;
  text: string;
}

interface ContextImage {
  filename: string;
  data: string;
  width: number;
  height: number;
}

interface RenderedInputContext {
  contextSnippets: ContextSnippet[];
  selectedContextImages: ContextImage[];
  attachmentNames: string[];
  addedLinks: string[];
  contextImages: ContextImage[];
}

interface AIAssistantSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  getSimplifiedDocument: () => SimplifiedDocument;
  onApplyLexicalChanges?: (changes: LexicalChange[], contextImages?: Array<{ filename: string; data: string; width: number; height: number }>) => void;
  // Legacy props for backward compatibility with Delta-based changes
  documentContent?: string;
  onApplyChanges?: (content: string, changes?: any[]) => void;
  isDiffModeActive?: boolean;
  onAcceptAllChanges?: () => void;
  onRejectAllChanges?: () => void;
  contextSnippets?: ContextSnippet[];
  selectedContextImages?: Array<{ filename: string; data: string; width: number; height: number }>;
  onRemoveContextSnippet?: (id: string) => void;
  onRemoveSelectedImage?: () => void;
  onClearContextSnippets?: () => void;
  onClearEditorSelection?: () => void;
  onChatFocusChange?: (isFocused: boolean) => void;
}

// Scale image dimensions to reasonable display size while preserving aspect ratio
function scaleToDisplaySize(width: number, height: number): { width: number; height: number } {
  const MAX_DISPLAY_WIDTH = 600; // Maximum initial display width
  const MAX_DISPLAY_HEIGHT = 600; // Maximum initial display height

  // If image fits within bounds, use actual size
  if (width <= MAX_DISPLAY_WIDTH && height <= MAX_DISPLAY_HEIGHT) {
    return { width, height };
  }

  // Calculate scale factor to fit within bounds while preserving aspect ratio
  const widthScale = MAX_DISPLAY_WIDTH / width;
  const heightScale = MAX_DISPLAY_HEIGHT / height;
  const scale = Math.min(widthScale, heightScale);

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

const INPUT_CONTEXT_COLLAPSE_DURATION_MS = 240;

export default function AIAssistantSidebar({
  isOpen,
  onToggle,
  getSimplifiedDocument,
  onApplyLexicalChanges,
  documentContent,
  onApplyChanges,
  isDiffModeActive = false,
  onAcceptAllChanges,
  onRejectAllChanges,
  contextSnippets = [],
  selectedContextImages = [],
  onRemoveContextSnippet,
  onRemoveSelectedImage,
  onClearContextSnippets,
  onClearEditorSelection,
  onChatFocusChange
}: AIAssistantSidebarProps) {
  const { isAuthenticated, isAnonymous, sessionToken, showSignupModal } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: 'Hi! I\'m your AI writing assistant. I can help you format your document, improve your writing, generate content, and more. What would you like to work on?',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkInputValue, setLinkInputValue] = useState('');
  const [attachmentNames, setAttachmentNames] = useState<string[]>([]);
  const [addedLinks, setAddedLinks] = useState<string[]>([]);
  const [contextImages, setContextImages] = useState<ContextImage[]>([]);
  const [renderedInputContext, setRenderedInputContext] = useState<RenderedInputContext>({
    contextSnippets,
    selectedContextImages,
    attachmentNames,
    addedLinks,
    contextImages,
  });

  const hasTriggeredOnboardingRef = useRef(false);
  const onboardingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputContextCollapseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageIdCounterRef = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const truncateContext = (text: string, limit = 160) => {
    if (text.length <= limit) return text;
    return `${text.slice(0, limit - 1)}…`;
  };

  // Handle streaming response from the AI
  const handleStreamingResponse = useCallback(async (
    endpoint: string,
    requestBody: any,
    messageId: string,
    isOnboarding: boolean
  ) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    console.log('[AIAssistant] Sending streaming request to:', endpoint);
    console.log('[AIAssistant] Request body:', { ...requestBody, document: '[REDACTED]' });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'apikey': anonKey || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('[AIAssistant] Response status:', response.status);
    console.log('[AIAssistant] Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AIAssistant] Streaming request failed:', errorText);
      throw new Error(`Streaming failed: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedContent = '';
    let changes: LexicalChange[] = [];
    let reasoning = '';
    let summary = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;

          try {
            const event = JSON.parse(line.slice(6));

            switch (event.type) {
              case 'token':
                console.log('[AIAssistant] Received token:', event.content);
                accumulatedContent += event.content;
                setMessages(prev => prev.map(msg =>
                  msg.id === messageId
                    ? { ...msg, content: accumulatedContent, isStreaming: true, isLoading: false }
                    : msg
                ));
                break;

              case 'changes':
                // Buffer changes - don't apply yet
                changes = event.changes;
                // Add tool usage indicator to the content
                if (accumulatedContent && !accumulatedContent.includes('\n\nUsing edit_document tool...')) {
                  accumulatedContent += '\n\nUsing edit_document tool...';
                  setMessages(prev => prev.map(msg =>
                    msg.id === messageId
                      ? { ...msg, content: accumulatedContent, isStreaming: true, isLoading: false }
                      : msg
                  ));
                }
                break;

              case 'reasoning':
                reasoning = event.reasoning;
                break;

              case 'summary':
                summary = event.summary;
                // Append summary to the accumulated content
                if (summary && !accumulatedContent.includes(summary)) {
                  accumulatedContent += `\n\n${summary}`;
                  setMessages(prev => prev.map(msg =>
                    msg.id === messageId
                      ? { ...msg, content: accumulatedContent, isStreaming: true, isLoading: false }
                      : msg
                  ));
                }
                break;

              case 'complete':
                console.log('[AIAssistant] Stream complete. Changes:', changes.length, 'Summary:', !!summary);
                console.log('[AIAssistant] Final accumulated content:', accumulatedContent);

                const finalizedContent = accumulatedContent.replace(
                  /Using edit_document tool\.\.\./g,
                  'Edited document'
                );

                // Apply all buffered changes with diff highlighting
                if (changes.length > 0 && onApplyLexicalChanges) {
                  onApplyLexicalChanges(changes, [...contextImages, ...selectedContextImages]);
                }

                // Use accumulated content (reasoning + tool indicator + summary)
                // Fallback only if nothing was captured
                const finalContent = finalizedContent.trim() || summary || 'Changes applied successfully.';

                setMessages(prev => prev.map(msg =>
                  msg.id === messageId
                    ? { ...msg, content: finalContent, isStreaming: false, isLoading: false }
                    : msg
                ));

                // Increment usage count for anonymous users
                if (isAnonymous && !isOnboarding) {
                  const count = parseInt(sessionStorage.getItem('vrite_ai_usage_count') || '0');
                  sessionStorage.setItem('vrite_ai_usage_count', String(count + 1));
                }
                break;

              case 'error':
                throw new Error(event.error);
            }
          } catch (parseError) {
            console.error('[AIAssistant] Error parsing SSE event:', parseError);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }, [sessionToken, isAnonymous, onApplyLexicalChanges, contextImages, selectedContextImages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (addMenuRef.current && !addMenuRef.current.contains(target)) {
        setIsAddMenuOpen(false);
        setIsLinkModalOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAddMenuOpen(false);
        setIsLinkModalOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // Helper function to trigger AI requests (both onboarding and user-initiated)
  const triggerAIRequest = useCallback(async (instruction: string, isOnboarding = false) => {
    setIsLoading(true);

    // Generate unique message ID with counter to prevent duplicates
    messageIdCounterRef.current += 1;
    const loadingMessage: Message = {
      id: `${Date.now()}-${messageIdCounterRef.current}`,
      type: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages(prev => [...prev, loadingMessage]);

    try {
      if (!sessionToken) {
        console.error('[AIAssistant] No session token available');
        setMessages(prev =>
          prev.map(msg =>
            msg.id === loadingMessage.id
              ? {
                  ...msg,
                  content: 'AI features require authentication. Please enable anonymous sign-ins in Supabase or sign in with Google.',
                  isLoading: false,
                }
              : msg
          )
        );
        setIsLoading(false);
        return;
      }

      console.log('[AIAssistant] AI request:', {
        anonymous: isAnonymous,
        authenticated: isAuthenticated,
        isOnboarding,
      });

      // Rate limiting for anonymous users (only for user-initiated requests)
      if (isAnonymous && !isOnboarding) {
        const usageCount = parseInt(sessionStorage.getItem('vrite_ai_usage_count') || '0');

        if (usageCount >= 3) {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === loadingMessage.id
                ? {
                    ...msg,
                    content: 'You\'ve reached the limit for anonymous AI usage. Sign in for unlimited access!',
                    isLoading: false,
                  }
                : msg
            )
          );
          setIsLoading(false);
          showSignupModal('ai-limit-reached');
          return;
        }
      }

      // Get document and conversation history
      const simplifiedDocument = getSimplifiedDocument();
      const conversationHistory = messages
        .filter(msg => !msg.isLoading && !msg.isStreaming)
        .map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content,
        }));

      // Call Edge Function (works for both anonymous and authenticated users)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const endpoint = `${supabaseUrl}/functions/v1/ai-command`;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const requestBody = {
        document: simplifiedDocument,
        instruction,
        conversation_history: conversationHistory,
        context_snippets: (
          [
            ...contextSnippets.map((snippet) => snippet.text),
            ...attachmentNames.map((name) => `Attachment: ${name}`),
            ...addedLinks.map((link) => `Link: ${link}`)
          ]
        ).length > 0
          ? [
              ...contextSnippets.map((snippet) => snippet.text),
              ...attachmentNames.map((name) => `Attachment: ${name}`),
              ...addedLinks.map((link) => `Link: ${link}`)
            ]
          : undefined,
        context_images: [...contextImages, ...selectedContextImages].length > 0 ? [...contextImages, ...selectedContextImages] : undefined,
        stream: true, // Enable streaming by default
      };


      // Try streaming first, with fallback to non-streaming
      try {
        console.log('[AIAssistant] Attempting streaming request...');
        await handleStreamingResponse(endpoint, requestBody, loadingMessage.id, isOnboarding);
        console.log('[AIAssistant] Streaming completed successfully');

        // Clear context images after successful request
        setContextImages([]);
      } catch (streamError) {
        console.error('[AIAssistant] Streaming failed, falling back to non-streaming:', streamError);

        // Fallback to non-streaming
        const fallbackRequestBody = {
          ...requestBody,
          stream: false,
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'apikey': anonKey || '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(fallbackRequestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();

          // Handle rate limit for Edge Function
          if (response.status === 429) {
            setMessages(prev =>
              prev.map(msg =>
                msg.id === loadingMessage.id
                  ? {
                      ...msg,
                      content: 'Rate limit exceeded. Please wait before making more requests.',
                      isLoading: false,
                    }
                  : msg
              )
            );
            setIsLoading(false);
            return;
          }

          throw new Error(`AI service error: ${errorText}`);
        }

        const data = await response.json();

        // Increment anonymous usage count (only for user-initiated requests)
        if (isAnonymous && !isOnboarding) {
          const currentCount = parseInt(sessionStorage.getItem('vrite_ai_usage_count') || '0');
          sessionStorage.setItem('vrite_ai_usage_count', String(currentCount + 1));
        }

        // Handle response
        if (data.type === 'lexical_changes' && data.changes && data.changes.length > 0) {
          if (onApplyLexicalChanges) {
            onApplyLexicalChanges(data.changes, [...contextImages, ...selectedContextImages]);
          }
        }

        const displayMessage = data.reasoning
          ? `**Reasoning:** ${data.reasoning}\n\n${data.summary || 'Changes applied.'}`
          : data.summary || 'Changes applied successfully.';

        setMessages(prev =>
          prev.map(msg =>
            msg.id === loadingMessage.id
              ? { ...msg, content: displayMessage, isLoading: false }
              : msg
          )
        );

        // Clear context images after successful non-streaming request
        setContextImages([]);
      }
    } catch (error) {
      console.error('[AIAssistant] Error:', error);
      setMessages(prev =>
        prev.map(msg =>
          msg.id === loadingMessage.id
            ? {
                ...msg,
                content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                isLoading: false,
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [sessionToken, isAuthenticated, isAnonymous, messages, getSimplifiedDocument, onApplyLexicalChanges, showSignupModal, contextSnippets, contextImages, selectedContextImages, attachmentNames, addedLinks, handleStreamingResponse]);

  // Automatic AI onboarding for anonymous users
  useEffect(() => {
    // Only set timer once
    if (hasTriggeredOnboardingRef.current || onboardingTimerRef.current) {
      return;
    }

    const hasSeenOnboarding = typeof window !== 'undefined' && localStorage.getItem('vrite_has_seen_onboarding');

    if (!hasSeenOnboarding && isAuthenticated === false && sessionToken) {
      hasTriggeredOnboardingRef.current = true;

      // Trigger onboarding after a short delay to let the editor load
      onboardingTimerRef.current = setTimeout(async () => {
        const onboardingPrompt = `Please introduce yourself to the user and explain your capabilities as an AI writing assistant. Format this nicely in the document. Include:
- Who you are (an AI assistant for writing and editing)
- Key capabilities (formatting, editing, content generation, document styling)
- How to use you (highlight text, use keyboard shortcuts, ask questions)
- What makes you special (real-time collaboration, intelligent suggestions)

Keep it concise, friendly, and well-formatted with headings and bullet points.`;

        // Add welcome message to chat
        messageIdCounterRef.current += 1;
        setMessages(prev => [
          ...prev,
          {
            id: `onboarding-welcome-${Date.now()}-${messageIdCounterRef.current}`,
            type: 'assistant',
            content: '👋 Welcome! Let me introduce myself...',
            timestamp: new Date(),
          },
        ]);

        // Trigger AI request
        await triggerAIRequest(onboardingPrompt, true);

        // Mark onboarding as seen
        if (typeof window !== 'undefined') {
          localStorage.setItem('vrite_has_seen_onboarding', 'true');
        }

        // Clear the ref after firing
        onboardingTimerRef.current = null;
      }, 500);

      console.log('[AIAssistant] Onboarding timer set, will fire in 0.5 seconds');
    }
  }, [isAuthenticated, sessionToken, triggerAIRequest]);

  const handleSendMessage = async () => {
    const hasTypedMessage = inputMessage.trim().length > 0;
    const hasAddedContext = attachmentNames.length > 0 || addedLinks.length > 0 || contextSnippets.length > 0 || contextImages.length > 0 || selectedContextImages.length > 0;
    if ((!hasTypedMessage && !hasAddedContext) || isLoading) return;

    const composedMessage = hasTypedMessage ? inputMessage : 'Use the added context to help with this request.';

    messageIdCounterRef.current += 1;
    // Combine both manually attached images and selected images
    const allImages = [...contextImages, ...selectedContextImages];
    const userMessage: Message = {
      id: `${Date.now()}-${messageIdCounterRef.current}`,
      type: 'user',
      content: composedMessage,
      timestamp: new Date(),
      images: allImages.length > 0 ? allImages : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    const instruction = composedMessage;
    setInputMessage('');

    // Clear selected images after adding to message (like text context snippets)
    onRemoveSelectedImage?.();

    // NOTE: Don't clear contextImages here - they're needed in triggerAIRequest
    // They'll be cleared after the request completes successfully

    await triggerAIRequest(instruction, false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const copyToClipboard = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const clearChat = () => {
    setMessages([{
      id: '1',
      type: 'assistant',
      content: 'Hi! I\'m your AI writing assistant. I can help you format your document, improve your writing, generate content, and more. What would you like to work on?',
      timestamp: new Date()
    }]);
  };

  const handleAddFilesClick = () => {
    setIsAddMenuOpen(false);
    setIsLinkModalOpen(false);
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    // Process each file
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        try {
          // Compress and get image data (same as manual insertion)
          const result = await compressImageToBase64(file);
          const displaySize = scaleToDisplaySize(result.width, result.height);

          setContextImages((prev) => {
            // Check if already added
            if (prev.some(img => img.filename === file.name)) {
              return prev;
            }
            return [
              ...prev,
              {
                filename: file.name,
                data: result.src,
                width: displaySize.width,
                height: displaySize.height,
              }
            ];
          });
        } catch (err) {
          console.error('[AIAssistant] Failed to process image:', file.name, err);
        }
      } else {
        // Non-image files (PDFs, CSVs) - keep existing behavior
        setAttachmentNames((prev) =>
          prev.includes(file.name) ? prev : [...prev, file.name]
        );
      }
    }

    event.target.value = '';
  };

  const handleAddLink = () => {
    const raw = linkInputValue.trim();
    if (!raw) {
      return;
    }

    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

    setAddedLinks((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setLinkInputValue('');
    setIsLinkModalOpen(false);
    setIsAddMenuOpen(false);
  };

  const removeAttachmentName = (name: string) => {
    setAttachmentNames((prev) => prev.filter((item) => item !== name));
  };

  const removeAddedLink = (link: string) => {
    setAddedLinks((prev) => prev.filter((item) => item !== link));
  };

  const hasAnyInputContext =
    contextSnippets.length > 0 ||
    selectedContextImages.length > 0 ||
    attachmentNames.length > 0 ||
    addedLinks.length > 0 ||
    contextImages.length > 0;

  useEffect(() => {
    if (hasAnyInputContext) {
      if (inputContextCollapseTimerRef.current) {
        clearTimeout(inputContextCollapseTimerRef.current);
        inputContextCollapseTimerRef.current = null;
      }
      setRenderedInputContext({
        contextSnippets,
        selectedContextImages,
        attachmentNames,
        addedLinks,
        contextImages,
      });
      return;
    }

    if (inputContextCollapseTimerRef.current) {
      return;
    }

    inputContextCollapseTimerRef.current = setTimeout(() => {
      setRenderedInputContext({
        contextSnippets: [],
        selectedContextImages: [],
        attachmentNames: [],
        addedLinks: [],
        contextImages: [],
      });
      inputContextCollapseTimerRef.current = null;
    }, INPUT_CONTEXT_COLLAPSE_DURATION_MS);
  }, [
    hasAnyInputContext,
    contextSnippets,
    selectedContextImages,
    attachmentNames,
    addedLinks,
    contextImages,
  ]);

  useEffect(() => {
    return () => {
      if (inputContextCollapseTimerRef.current) {
        clearTimeout(inputContextCollapseTimerRef.current);
      }
    };
  }, []);

  const inputContextForRender = hasAnyInputContext
    ? { contextSnippets, selectedContextImages, attachmentNames, addedLinks, contextImages }
    : renderedInputContext;
  const hasRenderedInputContext =
    inputContextForRender.contextSnippets.length > 0 ||
    inputContextForRender.selectedContextImages.length > 0 ||
    inputContextForRender.attachmentNames.length > 0 ||
    inputContextForRender.addedLinks.length > 0 ||
    inputContextForRender.contextImages.length > 0;

  return (
    <div className="ai-sidebar-shell">
      <div className={`ai-sidebar ${isOpen ? 'ai-sidebar-open' : 'ai-sidebar-closed'}`}>
        <div className="ai-sidebar-header">
          <div className="ai-sidebar-title">
            <span>AI Assistant</span>
          </div>
          <div className="ai-sidebar-controls">
            <button
              onClick={clearChat}
              className="ai-sidebar-control-btn"
              title="Clear Chat"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={onToggle}
              className="ai-sidebar-control-btn"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="ai-sidebar-content">
          <div className="ai-messages">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`ai-message ai-message-${message.type}`}
              >
                <div className="ai-message-content">
                  {message.isLoading ? (
                    <div className="ai-message-loading">
                      <span className="ai-thinking-text" aria-label="Thinking">
                        {'Thinking'.split('').map((letter, index) => (
                          <span
                            key={`${letter}-${index}`}
                            className="ai-thinking-letter"
                            style={{ animationDelay: `${index * 0.08}s` }}
                          >
                            {letter}
                          </span>
                        ))}
                      </span>
                    </div>
                  ) : message.isStreaming ? (
                    <div className="ai-message-streaming">
                      <div className="ai-message-text">
                        <FormattedMessageContent content={message.content} />
                        <span className="ai-streaming-cursor">▊</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {message.type === 'user' && message.images && message.images.length > 0 && (
                        <div className="ai-message-image-preview">
                          {message.images.map((img, idx) => (
                            <img
                              key={idx}
                              src={img.data}
                              alt={img.filename}
                              className="ai-message-image-thumbnail"
                            />
                          ))}
                        </div>
                      )}
                      <div
                        className={
                          message.type === 'user'
                            ? 'ai-message-text !ml-auto !w-fit !max-w-[82%] !rounded-2xl !border !border-transparent !bg-slate-200 !px-3 !py-2 !text-slate-800'
                            : 'ai-message-text'
                        }
                      >
                        <FormattedMessageContent content={message.content} />
                      </div>
                      {message.type === 'assistant' && !message.isLoading && (
                        <div className="ai-message-actions">
                          <button
                            onClick={() => copyToClipboard(message.content, message.id)}
                            className="ai-message-action-btn"
                            title="Copy to clipboard"
                          >
                            {copiedMessageId === message.id ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {isDiffModeActive && (
            <div className="ai-diff-actions">
              <div className="diff-mode-actions">
                <button
                  onClick={() => onRejectAllChanges?.()}
                  className="diff-mode-btn diff-mode-reject-all"
                  title="Reject all changes"
                >
                  <X size={16} />
                  Reject All
                </button>
                <button
                  onClick={() => onAcceptAllChanges?.()}
                  className="diff-mode-btn diff-mode-accept-all"
                  title="Accept all changes"
                >
                  <Check size={16} />
                  Accept All
                </button>
              </div>
            </div>
          )}

          {/* Input */}
          <div className="ai-input-container">
            <div className="ai-input-shell">
              <div className={`ai-input-context-collapse ${hasAnyInputContext ? 'ai-input-context-collapse-open' : ''}`}>
                <div className="ai-input-context-collapse-inner">
                  {hasRenderedInputContext && (
                    <div className="ai-input-context">
                      <div className="ai-context-chip-list">
                        {inputContextForRender.contextSnippets.map((snippet) => (
                          <div
                            key={snippet.id}
                            className="ai-context-chip ai-context-chip-selected ai-context-chip-overlay-remove !inline-flex !w-fit !self-start !justify-start !gap-0 !rounded-full !px-2.5 !py-1.5"
                            style={{ maxWidth: 'clamp(180px, 45%, 280px)' }}
                          >
                            <span
                              title={snippet.text}
                              className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap !leading-4"
                            >
                              {snippet.text}
                            </span>
                            <button
                              type="button"
                              className="ai-context-chip-remove"
                              onClick={() => onRemoveContextSnippet?.(snippet.id)}
                              aria-label="Clear selection"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        {inputContextForRender.selectedContextImages.map((img, idx) => (
                          <div
                            key={`selected-${idx}`}
                            className="ai-context-chip ai-context-chip-selected ai-context-chip-overlay-remove ai-image-chip !inline-flex !w-fit !self-start !justify-start !gap-1.5 !rounded-full !pl-1.5 !pr-2.5 !py-1.5"
                            style={{ maxWidth: 'clamp(180px, 45%, 280px)' }}
                          >
                            <img src={img.data} alt={img.filename} className="ai-context-image-preview" />
                            <span
                              title={img.filename}
                              className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap !leading-4"
                            >
                              {img.filename || 'Selected image'}
                            </span>
                            <button
                              type="button"
                              className="ai-context-chip-remove"
                              onClick={() => onRemoveSelectedImage?.()}
                              aria-label="Remove selected image"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        {inputContextForRender.attachmentNames.map((name) => (
                          <div
                            key={name}
                            className="ai-context-chip ai-context-chip-selected ai-context-chip-overlay-remove ai-attachment-chip !inline-flex !w-fit !self-start !justify-start !gap-0 !rounded-full !px-2.5 !py-1.5"
                            style={{ maxWidth: 'clamp(180px, 45%, 280px)' }}
                          >
                            <span
                              title={name}
                              className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap !leading-4"
                            >
                              {name}
                            </span>
                            <button
                              type="button"
                              className="ai-context-chip-remove"
                              onClick={() => removeAttachmentName(name)}
                              aria-label="Remove attachment"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        {inputContextForRender.addedLinks.map((link) => (
                          <div
                            key={link}
                            className="ai-context-chip ai-context-chip-selected ai-context-chip-overlay-remove ai-link-chip !inline-flex !w-fit !self-start !justify-start !gap-0 !rounded-full !px-2.5 !py-1.5"
                            style={{ maxWidth: 'clamp(180px, 45%, 280px)' }}
                          >
                            <span
                              title={link}
                              className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap !leading-4"
                            >
                              {link}
                            </span>
                            <button
                              type="button"
                              className="ai-context-chip-remove"
                              onClick={() => removeAddedLink(link)}
                              aria-label="Remove link"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        {inputContextForRender.contextImages.map((img) => (
                          <div
                            key={img.filename}
                            className="ai-context-chip ai-context-chip-selected ai-context-chip-overlay-remove ai-image-chip !inline-flex !w-fit !self-start !justify-start !gap-1.5 !rounded-full !pl-1.5 !pr-2.5 !py-1.5"
                            style={{ maxWidth: 'clamp(180px, 45%, 280px)' }}
                          >
                            <img src={img.data} alt={img.filename} className="ai-context-image-preview" />
                            <span
                              title={img.filename}
                              className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap !leading-4"
                            >
                              {img.filename}
                            </span>
                            <button
                              type="button"
                              className="ai-context-chip-remove"
                              onClick={() => setContextImages(prev => prev.filter(i => i.filename !== img.filename))}
                              aria-label="Remove image"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <textarea
                ref={inputRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                onFocus={() => onChatFocusChange?.(true)}
                onBlur={() => onChatFocusChange?.(false)}
                placeholder="Ask me anything about your document..."
                className="ai-input"
                rows={2}
                disabled={isLoading}
              />
              <div className="ai-add-menu-anchor" ref={addMenuRef}>
                <button
                  type="button"
                  className={`ai-add-btn ${isAddMenuOpen ? 'ai-add-btn-open' : ''}`}
                  aria-label="Add attachments or links"
                  onClick={() => {
                    setIsAddMenuOpen((prev) => !prev);
                    setIsLinkModalOpen(false);
                  }}
                >
                  <Plus size={18} />
                </button>

                {isAddMenuOpen && !isLinkModalOpen && (
                  <div className="ai-add-menu">
                    <button type="button" className="ai-add-menu-item" onClick={handleAddFilesClick}>
                      <Paperclip size={18} />
                      <span>Add images, PDFs or CSVs</span>
                    </button>
                    <button
                      type="button"
                      className="ai-add-menu-item"
                      onClick={() => setIsLinkModalOpen(true)}
                    >
                      <AtSign size={18} />
                      <span>Add links</span>
                    </button>
                  </div>
                )}

                {isAddMenuOpen && isLinkModalOpen && (
                  <div className="ai-link-modal">
                    <input
                      type="url"
                      className="ai-link-input"
                      placeholder="Paste a link"
                      value={linkInputValue}
                      onChange={(e) => setLinkInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddLink();
                        }
                      }}
                    />
                    <div className="ai-link-modal-actions">
                      <button
                        type="button"
                        className="ai-link-modal-btn"
                        onClick={() => {
                          setIsLinkModalOpen(false);
                          setLinkInputValue('');
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="ai-link-modal-btn ai-link-modal-btn-primary"
                        onClick={handleAddLink}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.csv"
                multiple
                className="ai-hidden-file-input"
                onChange={handleFilesSelected}
                hidden
                tabIndex={-1}
              />

              <button
                onClick={handleSendMessage}
                disabled={(inputMessage.trim().length === 0 && attachmentNames.length === 0 && addedLinks.length === 0 && contextSnippets.length === 0) || isLoading}
                className="ai-send-btn"
                title="Send message"
              >
                <ArrowUp size={20} className="ai-send-icon" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
