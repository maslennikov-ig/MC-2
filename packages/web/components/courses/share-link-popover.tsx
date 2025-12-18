'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Share2,
  Link2,
  Copy,
  X,
  Check,
  Loader2,
  ExternalLink,
} from 'lucide-react';

interface ShareLinkPopoverProps {
  shareToken: string | null;
  isPublished: boolean;
  onGenerateLink: () => Promise<void>;
  onRemoveLink: () => Promise<void>;
  className?: string;
  buttonVariant?: 'default' | 'outline' | 'ghost' | 'secondary';
}

export function ShareLinkPopover({
  shareToken,
  isPublished,
  onGenerateLink,
  onRemoveLink,
  className,
  buttonVariant = 'ghost',
}: ShareLinkPopoverProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isCopied, setIsCopied] = React.useState(false);

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
      // Fallback для старых браузеров
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
    setIsLoading(true);
    try {
      await onGenerateLink();
      toast.success('Публичная ссылка создана');
    } catch {
      toast.error('Не удалось создать публичную ссылку');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveLink = async () => {
    setIsLoading(true);
    try {
      await onRemoveLink();
      toast.success('Публичная ссылка удалена');
      setIsOpen(false);
    } catch {
      toast.error('Не удалось удалить публичную ссылку');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenLink = () => {
    if (shareUrl) {
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={buttonVariant}
          size="icon"
          className={className}
          disabled={!isPublished || isLoading}
          title={shareToken ? 'Управление публичной ссылкой' : 'Создать публичную ссылку'}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : shareToken ? (
            <Link2 className="h-4 w-4" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">
              {shareToken ? 'Публичная ссылка' : 'Поделиться курсом'}
            </h4>
            <p className="text-sm text-muted-foreground">
              {shareToken
                ? 'Любой, у кого есть эта ссылка, может просмотреть курс'
                : 'Создайте публичную ссылку для доступа к курсу'}
            </p>
          </div>

          {shareToken && shareUrl ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="share-link" className="text-xs">
                  Публичная ссылка
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="share-link"
                    value={shareUrl}
                    readOnly
                    className="flex-1 font-mono text-xs"
                    onClick={(e) => {
                      e.currentTarget.select();
                    }}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCopyLink}
                    title="Скопировать ссылку"
                  >
                    {isCopied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleOpenLink}
                    title="Открыть в новой вкладке"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveLink}
                  disabled={isLoading}
                  className="text-destructive hover:text-destructive"
                >
                  <X className="h-4 w-4 mr-2" />
                  Удалить ссылку
                </Button>
              </div>

              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">
                  <strong>Совет:</strong> Публичная ссылка действует бессрочно.
                  Вы можете удалить её в любой момент, чтобы закрыть доступ.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <Button
                onClick={handleGenerateLink}
                disabled={isLoading || !isPublished}
                className="w-full"
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

              {!isPublished && (
                <p className="text-xs text-amber-600 text-center">
                  Сначала опубликуйте курс, чтобы создать публичную ссылку
                </p>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}