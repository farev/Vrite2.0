'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Sparkles,
  X,
  RefreshCw,
  Copy,
  Check,
  User
} from 'lucide-react';
import type { SimplifiedDocument } from '@/lib/lexicalSerializer';
import type { LexicalChange } from '@/lib/lexicalChangeApplicator';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

export interface ContextSnippet {
  id: string;
  text: string;
}

interface AIAssistantSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  getSimplifiedDocument: () => SimplifiedDocument;
  onApplyLexicalChanges?: (changes: LexicalChange[]) => void;
  // Legacy props for backward compatibility with Delta-based changes
  documentContent?: string;
  onApplyChanges?: (content: string, changes?: any[]) => void;
  isDiffModeActive?: boolean;
  onAcceptAllChanges?: () => void;
  onRejectAllChanges?: () => void;
  contextSnippets?: ContextSnippet[];
  onRemoveContextSnippet?: (id: string) => void;
  onClearContextSnippets?: () => void;
}

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
  onRemoveContextSnippet,
  onClearContextSnippets
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
  const hasTriggeredOnboardingRef = useRef(false);
  const onboardingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageIdCounterRef = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const truncateContext = (text: string, limit = 160) => {
    if (text.length <= limit) return text;
    return `${text.slice(0, limit - 1)}…`;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
        .filter(msg => !msg.isLoading)
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
        context_snippets: contextSnippets.length > 0
          ? contextSnippets.map((snippet) => snippet.text)
          : undefined,
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'apikey': anonKey || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
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
          onApplyLexicalChanges(data.changes);
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
  }, [sessionToken, isAuthenticated, isAnonymous, messages, getSimplifiedDocument, onApplyLexicalChanges, showSignupModal, contextSnippets]);

  // Automatic AI onboarding for anonymous users
  useEffect(() => {
    // Only set timer once
    if (hasTriggeredOnboardingRef.current || onboardingTimerRef.current) {
      return;
    }

    const hasSeenOnboarding = typeof window !== 'undefined' && localStorage.getItem('vrite_has_seen_onboarding');

    console.log('[AIAssistant] Onboarding check:', {
      hasSeenOnboarding: !!hasSeenOnboarding,
      isAuthenticated,
      hasSession: !!sessionToken,
      hasTriggeredOnboarding: hasTriggeredOnboardingRef.current,
      timerSet: !!onboardingTimerRef.current,
      shouldTrigger: !hasSeenOnboarding && isAuthenticated === false && sessionToken !== null
    });

    if (!hasSeenOnboarding && isAuthenticated === false && sessionToken) {
      hasTriggeredOnboardingRef.current = true;

      // Trigger onboarding after a short delay to let the editor load
      onboardingTimerRef.current = setTimeout(async () => {
        console.log('[AIAssistant] Triggering automatic onboarding for anonymous user');

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
    if (!inputMessage.trim() || isLoading) return;

    messageIdCounterRef.current += 1;
    const userMessage: Message = {
      id: `${Date.now()}-${messageIdCounterRef.current}`,
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const instruction = inputMessage;
    setInputMessage('');

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
              <RefreshCw size={16} />
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
                {message.type === 'user' && (
                  <div className="ai-message-icon">
                    <User size={16} />
                  </div>
                )}
                <div className="ai-message-content">
                  {message.isLoading ? (
                    <div className="ai-message-loading">
                      <div className="ai-loading-dots">
                        <div></div>
                        <div></div>
                        <div></div>
                      </div>
                      <span>Thinking...</span>
                    </div>
                  ) : (
                    <>
                      <div className="ai-message-text">
                        {message.content}
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

          {/* Context Panel */}
          {contextSnippets.length > 0 && (
            <div className="ai-context-panel">
              <div className="ai-context-panel-header">
                <span>Selected text</span>
                <button
                  type="button"
                  className="ai-context-chip-remove"
                  onClick={() => onRemoveContextSnippet?.(contextSnippets[0]?.id)}
                  aria-label="Clear selection"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="ai-context-chip-list">
                {contextSnippets.map((snippet) => (
                  <div key={snippet.id} className="ai-context-chip ai-context-chip-selected">
                    <span>{snippet.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}


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
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me anything about your document..."
              className="ai-input"
              rows={3}
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className="ai-send-btn"
              title="Send message"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
