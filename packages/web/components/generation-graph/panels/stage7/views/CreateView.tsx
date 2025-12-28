import React, { useState } from 'react';
import { useLocale } from 'next-intl';
import { Loader2, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useEnrichmentInspectorStore } from '../../../stores/enrichment-inspector-store';
import { cn } from '@/lib/utils';

export interface CreateViewProps {
  type: 'quiz' | 'video' | 'audio' | 'presentation';
  lessonId: string;
  className?: string;
}

interface FormProps {
  onSubmit: (settings: Record<string, unknown>) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  isSubmitting: boolean;
}

// Quiz Form Component
function QuizCreateForm({ onSubmit, onCancel, onDirtyChange, isSubmitting }: FormProps) {
  const locale = useLocale();
  const [questionCount, setQuestionCount] = useState(5);
  const [difficulty, setDifficulty] = useState<'easy' | 'balanced' | 'hard'>('balanced');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ questionCount, difficultyBias: difficulty });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label>{locale === 'ru' ? 'Количество вопросов' : 'Question Count'}</Label>
          <Slider
            value={[questionCount]}
            onValueChange={([v]) => { setQuestionCount(v); onDirtyChange(true); }}
            min={3}
            max={10}
            step={1}
            className="mt-2"
          />
          <span className="text-sm text-muted-foreground mt-1 block">{questionCount}</span>
        </div>

        <div>
          <Label>{locale === 'ru' ? 'Сложность' : 'Difficulty'}</Label>
          <Select
            value={difficulty}
            onValueChange={(v) => {
              setDifficulty(v as 'easy' | 'balanced' | 'hard');
              onDirtyChange(true);
            }}
          >
            <SelectTrigger className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">{locale === 'ru' ? 'Легкий' : 'Easy'}</SelectItem>
              <SelectItem value="balanced">{locale === 'ru' ? 'Сбалансированный' : 'Balanced'}</SelectItem>
              <SelectItem value="hard">{locale === 'ru' ? 'Сложный' : 'Hard'}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          {locale === 'ru' ? 'Отмена' : 'Cancel'}
        </Button>
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {locale === 'ru' ? 'Создать' : 'Create'}
        </Button>
      </div>
    </form>
  );
}

// Video Form Component
function VideoCreateForm({ onSubmit, onCancel, onDirtyChange, isSubmitting }: FormProps) {
  const locale = useLocale();
  const [voice, setVoice] = useState('alloy');
  const [speed, setSpeed] = useState(1.0);
  const [format, setFormat] = useState<'mp4' | 'webm'>('mp4');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ voice, speed, format });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label>{locale === 'ru' ? 'Голос' : 'Voice'}</Label>
          <Select
            value={voice}
            onValueChange={(v) => {
              setVoice(v);
              onDirtyChange(true);
            }}
          >
            <SelectTrigger className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alloy">Alloy</SelectItem>
              <SelectItem value="echo">Echo</SelectItem>
              <SelectItem value="fable">Fable</SelectItem>
              <SelectItem value="onyx">Onyx</SelectItem>
              <SelectItem value="nova">Nova</SelectItem>
              <SelectItem value="shimmer">Shimmer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>{locale === 'ru' ? 'Скорость' : 'Speed'}</Label>
          <Slider
            value={[speed]}
            onValueChange={([v]) => { setSpeed(v); onDirtyChange(true); }}
            min={0.5}
            max={2.0}
            step={0.1}
            className="mt-2"
          />
          <span className="text-sm text-muted-foreground mt-1 block">{speed.toFixed(1)}x</span>
        </div>

        <div>
          <Label>{locale === 'ru' ? 'Формат' : 'Format'}</Label>
          <Select
            value={format}
            onValueChange={(v) => {
              setFormat(v as 'mp4' | 'webm');
              onDirtyChange(true);
            }}
          >
            <SelectTrigger className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mp4">MP4</SelectItem>
              <SelectItem value="webm">WebM</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          {locale === 'ru' ? 'Отмена' : 'Cancel'}
        </Button>
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {locale === 'ru' ? 'Создать' : 'Create'}
        </Button>
      </div>
    </form>
  );
}

// Audio Form Component
function AudioCreateForm({ onSubmit, onCancel, onDirtyChange, isSubmitting }: FormProps) {
  const locale = useLocale();
  const [voice, setVoice] = useState('alloy');
  const [speed, setSpeed] = useState(1.0);
  const [format, setFormat] = useState<'mp3' | 'opus' | 'aac'>('mp3');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ voice, speed, format });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label>{locale === 'ru' ? 'Голос' : 'Voice'}</Label>
          <Select
            value={voice}
            onValueChange={(v) => {
              setVoice(v);
              onDirtyChange(true);
            }}
          >
            <SelectTrigger className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alloy">Alloy</SelectItem>
              <SelectItem value="echo">Echo</SelectItem>
              <SelectItem value="fable">Fable</SelectItem>
              <SelectItem value="onyx">Onyx</SelectItem>
              <SelectItem value="nova">Nova</SelectItem>
              <SelectItem value="shimmer">Shimmer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>{locale === 'ru' ? 'Скорость' : 'Speed'}</Label>
          <Slider
            value={[speed]}
            onValueChange={([v]) => { setSpeed(v); onDirtyChange(true); }}
            min={0.5}
            max={2.0}
            step={0.1}
            className="mt-2"
          />
          <span className="text-sm text-muted-foreground mt-1 block">{speed.toFixed(1)}x</span>
        </div>

        <div>
          <Label>{locale === 'ru' ? 'Формат' : 'Format'}</Label>
          <Select
            value={format}
            onValueChange={(v) => {
              setFormat(v as 'mp3' | 'opus' | 'aac');
              onDirtyChange(true);
            }}
          >
            <SelectTrigger className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mp3">MP3</SelectItem>
              <SelectItem value="opus">Opus</SelectItem>
              <SelectItem value="aac">AAC</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          {locale === 'ru' ? 'Отмена' : 'Cancel'}
        </Button>
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {locale === 'ru' ? 'Создать' : 'Create'}
        </Button>
      </div>
    </form>
  );
}

// Presentation Form Component
function PresentationCreateForm({ onSubmit, onCancel, onDirtyChange, isSubmitting }: FormProps) {
  const locale = useLocale();
  const [theme, setTheme] = useState<'light' | 'dark' | 'colorful'>('light');
  const [maxSlides, setMaxSlides] = useState(10);
  const [includeNotes, setIncludeNotes] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ theme, maxSlides, includeNotes });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label>{locale === 'ru' ? 'Тема' : 'Theme'}</Label>
          <Select
            value={theme}
            onValueChange={(v) => {
              setTheme(v as 'light' | 'dark' | 'colorful');
              onDirtyChange(true);
            }}
          >
            <SelectTrigger className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">{locale === 'ru' ? 'Светлая' : 'Light'}</SelectItem>
              <SelectItem value="dark">{locale === 'ru' ? 'Темная' : 'Dark'}</SelectItem>
              <SelectItem value="colorful">{locale === 'ru' ? 'Красочная' : 'Colorful'}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>{locale === 'ru' ? 'Максимум слайдов' : 'Maximum Slides'}</Label>
          <Slider
            value={[maxSlides]}
            onValueChange={([v]) => { setMaxSlides(v); onDirtyChange(true); }}
            min={5}
            max={20}
            step={1}
            className="mt-2"
          />
          <span className="text-sm text-muted-foreground mt-1 block">{maxSlides}</span>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="includeNotes"
            checked={includeNotes}
            onChange={(e) => {
              setIncludeNotes(e.target.checked);
              onDirtyChange(true);
            }}
            className="w-4 h-4 rounded border-gray-300"
          />
          <Label htmlFor="includeNotes" className="cursor-pointer">
            {locale === 'ru' ? 'Включить заметки докладчика' : 'Include Speaker Notes'}
          </Label>
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          {locale === 'ru' ? 'Отмена' : 'Cancel'}
        </Button>
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {locale === 'ru' ? 'Создать' : 'Create'}
        </Button>
      </div>
    </form>
  );
}

/**
 * Sanitize error message for display
 */
function getErrorMessage(error: unknown, locale: string): string {
  if (error instanceof Error) {
    // Truncate long error messages
    const msg = error.message.replace(/<[^>]*>/g, '');
    return msg.length > 150 ? msg.slice(0, 150) + '...' : msg;
  }
  return locale === 'ru' ? 'Произошла ошибка при создании' : 'An error occurred while creating';
}

// Main CreateView Component
export function CreateView({ type, lessonId, className }: CreateViewProps) {
  const locale = useLocale();
  const { goBack, setDirty } = useEnrichmentInspectorStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle form submission
  const handleSubmit = async (settings: Record<string, unknown>) => {
    setIsSubmitting(true);
    setError(null); // Clear previous errors

    try {
      // TODO: Call tRPC mutation to create enrichment
      // await trpc.enrichment.create.mutate({ lessonId, type, settings });
      console.log('Creating enrichment:', { lessonId, type, settings });

      // Return to root view on success
      goBack();
    } catch (err) {
      console.error('Failed to create enrichment:', err);
      setError(getErrorMessage(err, locale));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancel (with dirty form check)
  const handleCancel = () => {
    // TODO: Show discard dialog if dirty
    goBack();
  };

  // Dismiss error alert
  const dismissError = () => setError(null);

  // Render form based on type
  const renderForm = () => {
    switch (type) {
      case 'quiz':
        return (
          <QuizCreateForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            onDirtyChange={setDirty}
            isSubmitting={isSubmitting}
          />
        );
      case 'video':
        return (
          <VideoCreateForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            onDirtyChange={setDirty}
            isSubmitting={isSubmitting}
          />
        );
      case 'audio':
        return (
          <AudioCreateForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            onDirtyChange={setDirty}
            isSubmitting={isSubmitting}
          />
        );
      case 'presentation':
        return (
          <PresentationCreateForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            onDirtyChange={setDirty}
            isSubmitting={isSubmitting}
          />
        );
      default:
        return null;
    }
  };

  return (
    <ScrollArea className={cn('flex-1 h-full', className)}>
      <div className="p-4 space-y-4">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>
              {locale === 'ru' ? 'Ошибка' : 'Error'}
            </AlertTitle>
            <AlertDescription className="flex items-start justify-between gap-2">
              <span>{error}</span>
              <button
                onClick={dismissError}
                className="shrink-0 text-destructive-foreground/70 hover:text-destructive-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </AlertDescription>
          </Alert>
        )}

        {renderForm()}
      </div>
    </ScrollArea>
  );
}
