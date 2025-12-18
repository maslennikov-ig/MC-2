'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Share2, Link2, Check, Loader2, Copy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ShareButtonProps {
  slug: string;
  shareToken?: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  className?: string;
}

export function ShareButton({
  slug,
  shareToken: initialToken,
  isOwner,
  isAdmin,
  className
}: ShareButtonProps) {
  const [shareToken, setShareToken] = useState(initialToken);
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch with retry logic
  const fetchWithRetry = useCallback(async (
    url: string,
    options: RequestInit,
    retries = 3,
    delay = 1000
  ): Promise<Response> => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // Create new AbortController for this request
        abortControllerRef.current = new AbortController();

        const timeoutId = setTimeout(() => {
          abortControllerRef.current?.abort();
        }, 10000); // 10 second timeout

        const response = await fetch(url, {
          ...options,
          signal: abortControllerRef.current.signal,
          credentials: 'include', // Ensure cookies are sent
        });

        clearTimeout(timeoutId);
        abortControllerRef.current = null;

        // If successful or client error, return immediately
        if (response.ok || response.status < 500) {
          return response;
        }

        // Server error - retry if we have attempts left
        if (attempt === retries - 1) {
          return response; // Last attempt, return the error response
        }

        // Wait before retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
      } catch (_error) {
        // Network error or timeout
        if (attempt === retries - 1) {
          throw _error; // Last attempt, throw the error
        }

        // Check if it's an abort error
        if (_error instanceof Error && _error.name === 'AbortError') {
          // Request timeout - will retry
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
      }
    }

    throw new Error('Failed after all retry attempts');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Check permissions
  const canShare = isOwner || isAdmin;
  if (!canShare) return null;

  // Use process.env for server-side or window.location for client-side
  const baseUrl = typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL || '';

  const shareUrl = shareToken
    ? `${baseUrl}/shared/${shareToken}`
    : null;

  const handleCopyLink = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
      toast.success('Ссылка скопирована в буфер обмена');
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setIsCopied(true);
        toast.success('Ссылка скопирована в буфер обмена');
        setTimeout(() => setIsCopied(false), 2000);
      } catch {
        toast.error('Не удалось скопировать ссылку');
      } finally {
        document.body.removeChild(textArea);
      }
    }
  };

  const handleGenerateLink = async () => {
    // Prevent multiple simultaneous requests
    if (isLoading) return;

    setIsLoading(true);
    try {
      // Creating share link for course

      const response = await fetchWithRetry(`/api/courses/${slug}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Parse response based on content type
      let data;
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        try {
          data = await response.json();
        } catch {
          // Failed to parse JSON response
          data = { error: 'Invalid response format' };
        }
      } else {
        // Try to get text response
        const text = await response.text();
        // Non-JSON response received
        data = { error: text || 'Invalid response format' };
      }

      if (!response.ok) {
        // Share API error - details in response

        // Provide user-friendly error messages
        let errorMessage = 'Не удалось создать публичную ссылку';
        if (response.status === 401) {
          errorMessage = 'Необходимо войти в систему для создания публичной ссылки';
        } else if (response.status === 403) {
          errorMessage = 'У вас нет прав для создания публичной ссылки на этот курс';
        } else if (response.status === 404) {
          errorMessage = 'Курс не найден';
        } else if (response.status >= 500) {
          errorMessage = 'Ошибка сервера. Попробуйте позже.';
        } else if (data.message) {
          errorMessage = data.message;
        }

        throw new Error(errorMessage);
      }

      // Share link created successfully
      setShareToken(data.shareToken);
      toast.success('Публичная ссылка создана');
    } catch (error) {
      // Error creating share link - will show toast

      let errorMessage = 'Не удалось создать публичную ссылку';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Превышено время ожидания. Попробуйте снова.';
        } else if (error.message) {
          errorMessage = error.message;
        }
      }

      toast.error(errorMessage, {
        action: {
          label: 'Повторить',
          onClick: () => handleGenerateLink(),
        },
      });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleRemoveLink = async () => {
    // Prevent multiple simultaneous requests
    if (isLoading) return;

    setIsLoading(true);
    try {
      // Removing share link for course

      const response = await fetchWithRetry(`/api/courses/${slug}/share`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Parse response
      let data;
      try {
        data = await response.json();
      } catch {
        // Failed to parse DELETE response
        data = { error: 'Invalid response format' };
      }

      if (!response.ok) {
        // Share API delete error - details in response

        let errorMessage = 'Не удалось удалить публичную ссылку';
        if (response.status === 401) {
          errorMessage = 'Необходимо войти в систему';
        } else if (response.status === 403) {
          errorMessage = 'У вас нет прав для удаления публичной ссылки';
        } else if (data.message) {
          errorMessage = data.message;
        }

        throw new Error(errorMessage);
      }

      // Share link removed successfully
      setShareToken(null);
      setIsOpen(false);
      toast.success('Публичная ссылка удалена');
    } catch (_error) {
      // Error removing share link - will show toast

      let errorMessage = 'Не удалось удалить публичную ссылку';
      if (_error instanceof Error && _error.message) {
        errorMessage = _error.message;
      }

      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'text-gray-400 hover:text-purple-400 transition-colors',
            shareToken && 'text-purple-400',
            className
          )}
          onClick={(e) => {
            e.stopPropagation();
          }}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : shareToken ? (
            <Link2 className="h-3.5 w-3.5" />
          ) : (
            <Share2 className="h-3.5 w-3.5" />
          )}
          <span className="sr-only">
            {shareToken ? 'Управление публичной ссылкой' : 'Поделиться курсом'}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 sm:w-96 z-50 p-0 border-0"
        align="center"
        side="top"
        sideOffset={8}
        alignOffset={0}
        onClick={(e) => e.stopPropagation()}
      >
        <Card className="border shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {shareToken ? 'Публичная ссылка' : 'Поделиться курсом'}
            </CardTitle>
            <CardDescription className="text-sm">
              {shareToken
                ? 'Любой, у кого есть эта ссылка, может просмотреть курс'
                : 'Создайте публичную ссылку для доступа к курсу'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {shareToken && shareUrl ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="share-link" className="text-sm font-medium">
                    Публичная ссылка
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="share-link"
                      value={shareUrl}
                      readOnly
                      className="flex-1 font-mono text-xs bg-muted/50"
                      onFocus={(e) => {
                        e.currentTarget.select();
                      }}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyLink();
                      }}
                      title="Скопировать ссылку"
                    >
                      {isCopied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex justify-between gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveLink();
                    }}
                    disabled={isLoading}
                    className="w-full"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Удалить ссылку
                  </Button>
                </div>

                <Alert className="bg-muted/50 border-muted">
                  <AlertDescription className="text-xs">
                    <strong>Совет:</strong> Публичная ссылка действует бессрочно.
                    Вы можете удалить её в любой момент, чтобы закрыть доступ.
                  </AlertDescription>
                </Alert>
              </>
            ) : (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  handleGenerateLink();
                }}
                disabled={isLoading}
                className="w-full"
                variant="default"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Создание ссылки...
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4 mr-2" />
                    Создать публичную ссылку
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}