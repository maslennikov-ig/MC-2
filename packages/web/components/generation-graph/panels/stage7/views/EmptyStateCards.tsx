'use client';

import React from 'react';
import { useLocale } from 'next-intl';
import { Video, HelpCircle, Headphones, Presentation, FileText, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CreateEnrichmentType } from '../../../stores/enrichment-inspector-store';

export interface EmptyStateCardsProps {
  onSelectType: (type: CreateEnrichmentType) => void;
  className?: string;
}

interface EnrichmentCardInfo {
  type: CreateEnrichmentType;
  icon: React.ReactNode;
  title: { en: string; ru: string };
  description: { en: string; ru: string };
  benefits: { en: string[]; ru: string[] };
  disabled?: boolean;
  comingSoon?: boolean;
}

const ENRICHMENT_CARDS: EnrichmentCardInfo[] = [
  {
    type: 'quiz',
    icon: <HelpCircle className="w-6 h-6" />,
    title: { en: 'Quiz', ru: 'Тест' },
    description: {
      en: 'Create an interactive quiz to assess student understanding',
      ru: 'Создайте интерактивный тест для проверки понимания студентов',
    },
    benefits: {
      en: ['Auto-generated questions based on lesson content', 'Multiple question types', "Bloom's taxonomy coverage"],
      ru: ['Вопросы генерируются автоматически', 'Разные типы вопросов', 'Покрытие таксономии Блума'],
    },
  },
  {
    type: 'video',
    icon: <Video className="w-6 h-6" />,
    title: { en: 'Video Script', ru: 'Сценарий видео' },
    description: {
      en: 'Generate a video script from lesson content',
      ru: 'Сгенерируйте сценарий видео из содержимого урока',
    },
    benefits: {
      en: ['Professional script structure', 'Review before finalizing', 'Edit and regenerate'],
      ru: ['Профессиональная структура сценария', 'Просмотр перед финализацией', 'Редактирование и регенерация'],
    },
  },
  {
    type: 'podcast',
    icon: <Headphones className="w-6 h-6" />,
    title: { en: 'Audio Narration', ru: 'Аудио нарратив' },
    description: {
      en: 'Create audio narration for mobile learning',
      ru: 'Создайте аудио-версию для мобильного обучения',
    },
    benefits: {
      en: ['Multiple voice options', 'Adjustable speed', 'Accessibility support'],
      ru: ['Разные голоса на выбор', 'Настраиваемая скорость', 'Поддержка доступности'],
    },
  },
  {
    type: 'mindmap',
    icon: <Presentation className="w-6 h-6" />,
    title: { en: 'Presentation', ru: 'Презентация' },
    description: {
      en: 'Generate slide presentation from lesson content',
      ru: 'Сгенерируйте слайды из содержимого урока',
    },
    benefits: {
      en: ['6x6 rule for clarity', 'Speaker notes included', 'Multiple themes'],
      ru: ['Правило 6x6 для ясности', 'Заметки докладчика', 'Разные темы оформления'],
    },
  },
  {
    type: 'reading',
    icon: <FileText className="w-6 h-6" />,
    title: { en: 'Document', ru: 'Документ' },
    description: {
      en: 'Create supplementary reading materials',
      ru: 'Создайте дополнительные материалы для чтения',
    },
    benefits: {
      en: ['Summary documents', 'Reference materials', 'Study guides'],
      ru: ['Резюме', 'Справочные материалы', 'Учебные пособия'],
    },
    disabled: true,
    comingSoon: true,
  },
];

function EnrichmentCard({
  card,
  locale,
  onSelect,
}: {
  card: EnrichmentCardInfo;
  locale: string;
  onSelect: () => void;
}) {
  const title = locale === 'ru' ? card.title.ru : card.title.en;
  const description = locale === 'ru' ? card.description.ru : card.description.en;
  const benefits = locale === 'ru' ? card.benefits.ru : card.benefits.en;

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all duration-200 cursor-pointer group',
        card.disabled
          ? 'opacity-60 cursor-not-allowed'
          : 'hover:shadow-md hover:border-primary/50 hover:-translate-y-0.5'
      )}
      onClick={card.disabled ? undefined : onSelect}
    >
      {card.comingSoon && (
        <div className="absolute top-2 right-2 px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
          {locale === 'ru' ? 'Скоро' : 'Coming Soon'}
        </div>
      )}

      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'p-2 rounded-lg',
              card.disabled
                ? 'bg-muted text-muted-foreground'
                : 'bg-primary/10 text-primary group-hover:bg-primary/20'
            )}
          >
            {card.icon}
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
        <CardDescription className="mt-2">{description}</CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        <ul className="space-y-1">
          {benefits.map((benefit, idx) => (
            <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
              <Sparkles className="w-3 h-3 mt-1 flex-shrink-0 text-primary/60" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * Empty state discovery cards for lessons without enrichments
 *
 * Shows a grid of enrichment type cards that users can click
 * to start creating their first enrichment.
 *
 * @example
 * ```tsx
 * <EmptyStateCards
 *   onSelectType={(type) => openCreate(type)}
 * />
 * ```
 */
export function EmptyStateCards({ onSelectType, className }: EmptyStateCardsProps) {
  const locale = useLocale();

  const heading = locale === 'ru' ? 'Добавьте обогащения к уроку' : 'Add Enrichments to Lesson';
  const subheading =
    locale === 'ru'
      ? 'Выберите тип обогащения для генерации'
      : 'Select an enrichment type to generate';

  return (
    <div className={cn('p-4 space-y-6', className)}>
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold">{heading}</h3>
        <p className="text-sm text-muted-foreground">{subheading}</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {ENRICHMENT_CARDS.map((card) => (
          <EnrichmentCard
            key={card.type}
            card={card}
            locale={locale}
            onSelect={() => onSelectType(card.type)}
          />
        ))}
      </div>
    </div>
  );
}
