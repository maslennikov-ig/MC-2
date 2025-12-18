import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, ChevronDown, ChevronUp, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/generation-graph/useTranslation';
import { QuickActions } from './QuickActions';
import { MarkdownRendererClient } from '@/components/markdown';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  pending?: boolean;
}

interface RefinementChatProps {
  courseId: string;
  stageId: string;
  nodeId?: string;
  attemptNumber: number;
  onRefine: (message: string) => void;
  history?: ChatMessage[];
  isProcessing?: boolean;
}

export const RefinementChat: React.FC<RefinementChatProps> = ({
  onRefine,
  history = [],
  isProcessing = false
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false); // Collapsed by default
  const [message, setMessage] = useState('');
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Combine history with pending messages for display
  const displayHistory = useMemo(() => {
    return [...(history || []), ...pendingMessages];
  }, [history, pendingMessages]);

  // Clear pending messages when history updates (message was processed)
  useEffect(() => {
    if (history && history.length > 0 && pendingMessages.length > 0) {
      // Check if the last history message matches our pending user message
      const lastHistoryMsg = history[history.length - 1];
      const lastPendingMsg = pendingMessages[pendingMessages.length - 1];

      if (lastHistoryMsg && lastPendingMsg &&
          lastHistoryMsg.role === 'user' &&
          lastPendingMsg.role === 'user') {
        // Clear pending messages as they've been confirmed
        setPendingMessages([]);
      }
    }
  }, [history, pendingMessages]);

  // Scroll to bottom on new messages (only within chat container, not page scroll)
  useEffect(() => {
    if (scrollRef.current && displayHistory.length > 0) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [displayHistory]);

  // Auto-focus textarea when chat opens (FR-022)
  useEffect(() => {
    if (!isOpen || !textareaRef.current) return;

    // Small delay to ensure DOM is rendered after animation
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 300);

    return () => clearTimeout(timer);
  }, [isOpen]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (message.trim() && !isProcessing) {
      // Add to pending immediately for optimistic update
      setPendingMessages(prev => [...prev, {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
        pending: true
      }]);

      onRefine(message);
      setMessage('');
    }
  };

  const handleQuickAction = (actionText: string) => {
      setMessage(actionText);
  };

  return (
    <div className="border rounded-md mt-6 bg-card" data-testid="refinement-chat">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full p-4 text-sm font-medium transition-colors hover:bg-accent/50"
        data-testid="refinement-chat-toggle"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <span>{t('refinementChat.panelTitle')}</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="p-4 pt-0 border-t">
          {displayHistory.length > 0 && (
            <ScrollArea className="h-[250px] pr-4 mb-4 border rounded-md bg-muted/20 p-2">
              <div className="space-y-4">
                {displayHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex w-full flex-col gap-1 text-sm",
                      msg.role === 'user' ? "items-end" : "items-start"
                    )}
                  >
                    <div className={cn(
                        "px-3 py-2 rounded-lg max-w-[90%]",
                         msg.role === 'user'
                           ? "bg-blue-500 text-white"
                           : "bg-gray-100 dark:bg-gray-800 border border-border",
                         msg.pending && "opacity-60"
                    )}>
                       {msg.role === 'assistant' ? (
                         <MarkdownRendererClient
                           content={msg.content}
                           preset="chat"
                           isStreaming={msg.pending || false}
                         />
                       ) : (
                         <span className="whitespace-pre-wrap">{msg.content}</span>
                       )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}

                {/* Thinking indicator when processing */}
                {isProcessing && (
                  <div className="flex w-full flex-col gap-1 text-sm items-start">
                    <div className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-border">
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="text-xs italic">{t('refinementChat.thinking')}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Invisible element to scroll to */}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>
          )}

          <div className="space-y-3">
             <QuickActions onSelect={handleQuickAction} disabled={isProcessing} />

             <form onSubmit={handleSubmit} className="flex gap-2">
                <Textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t('refinementChat.placeholder')}
                    className="min-h-[80px] resize-none"
                    disabled={isProcessing}
                    data-testid="refinement-input"
                />
                <Button 
                    type="submit" 
                    size="icon" 
                    className="h-[80px] w-[50px]"
                    disabled={!message.trim() || isProcessing}
                    data-testid="refinement-submit"
                    title={t('refinementChat.send')}
                >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};
