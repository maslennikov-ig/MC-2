'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageSquare,
  ChevronUp,
  ChevronDown,
  Send,
  Loader2,
  Sparkles,
  RefreshCcw,
  Scissors,
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { MarkdownRendererClient } from '@/components/markdown/MarkdownRendererClient';
import { toast } from '@/lib/toast';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  intent?: 'refine' | 'regenerate';
}

interface GlobalCourseChatProps {
  courseId: string;
  courseTitle?: string;
  isGenerating?: boolean;
  onRegenerationRequest?: () => void;
}

// Quick action buttons
const QUICK_ACTIONS = [
  {
    id: 'add-practice',
    label: 'Добавить практику',
    labelEn: 'Add practice',
    icon: Plus,
    prompt: 'Добавь больше практических заданий и упражнений в курс'
  },
  {
    id: 'simplify',
    label: 'Упростить',
    labelEn: 'Simplify',
    icon: Scissors,
    prompt: 'Упрости язык и объяснения, сделай материал более доступным'
  },
  {
    id: 'regenerate',
    label: 'Перегенерировать',
    labelEn: 'Regenerate',
    icon: RefreshCcw,
    prompt: 'Перегенерируй курс с учётом моих пожеланий'
  },
];

export function GlobalCourseChat({
  courseId,
  isGenerating = false,
  onRegenerationRequest
}: GlobalCourseChatProps) {
  const t = useTranslations('generation.globalChat');
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current && chatHistory.length > 0) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [chatHistory]);

  // Focus textarea when opening
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || isProcessing) return;

    setIsProcessing(true);

    // Optimistic update - add user message immediately
    const userMessage: ChatMessage = {
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString(),
    };
    setChatHistory(prev => [...prev, userMessage]);
    setMessage('');

    try {
      const response = await fetch('/api/trpc/generation.chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json: {
            courseId,
            chatType: 'global',
            userMessage: messageText,
            conversationId,
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();
      const result = data?.result?.data;

      if (result) {
        setConversationId(result.conversationId);

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: result.assistantMessage,
          timestamp: new Date().toISOString(),
          intent: result.intent,
        };
        setChatHistory(prev => [...prev, assistantMessage]);

        // If regeneration intent detected, trigger callback
        if (result.intent === 'regenerate' && onRegenerationRequest) {
          toast.info(t('regenerationTriggered'), {
            description: t('preparingRegeneration'),
          });
          onRegenerationRequest();
        }
      }
    } catch (error) {
      toast.error(t('error'), {
        description: t('errorDescription'),
      });
      // Remove optimistic message on error
      setChatHistory(prev => prev.slice(0, -1));
    } finally {
      setIsProcessing(false);
    }
  }, [courseId, conversationId, isProcessing, onRegenerationRequest, t]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    sendMessage(message);
  };

  const handleQuickAction = (actionPrompt: string) => {
    sendMessage(actionPrompt);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t shadow-lg">
      {/* Collapsed header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span>{t('title')}</span>
          {chatHistory.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({t('messageCount', { count: chatHistory.length })})
            </span>
          )}
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>

      {/* Expanded panel */}
      {isOpen && (
        <div className="border-t max-h-[400px] flex flex-col">
          {/* Chat history */}
          <ScrollArea className="flex-1 p-4 min-h-[200px]">
            {chatHistory.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>{t('emptyState')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {chatHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex w-full flex-col gap-1",
                      msg.role === 'user' ? "items-end" : "items-start"
                    )}
                  >
                    <div className={cn(
                      "px-3 py-2 rounded-lg max-w-[85%]",
                      msg.role === 'user'
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}>
                      {msg.role === 'assistant' ? (
                        <MarkdownRendererClient content={msg.content} preset="chat" />
                      ) : (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}

                {isProcessing && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">{t('thinking')}</span>
                  </div>
                )}

                <div ref={scrollRef} />
              </div>
            )}
          </ScrollArea>

          {/* Quick actions */}
          <div className="px-4 py-2 border-t flex gap-2 flex-wrap">
            {QUICK_ACTIONS.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                size="sm"
                onClick={() => handleQuickAction(action.prompt)}
                disabled={isProcessing || isGenerating}
                className="text-xs"
              >
                <action.icon className="w-3 h-3 mr-1" />
                {action.label}
              </Button>
            ))}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-4 pt-2 border-t flex gap-2">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('placeholder')}
              className="min-h-[60px] resize-none flex-1"
              disabled={isProcessing || isGenerating}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              className="h-[60px] w-[60px]"
              disabled={!message.trim() || isProcessing || isGenerating}
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
