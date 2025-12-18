// Phase name translations for Stage 4 and Stage 5

export interface PhaseInfo {
  ru: string;
  en: string;
  description: {
    ru: string;
    en: string;
  };
}

export const PHASE_NAMES: Record<string, Record<string, PhaseInfo>> = {
  stage_4: {
    phase_0: {
      ru: 'Подготовка',
      en: 'Preparation',
      description: {
        ru: 'Проверка готовности документов к анализу',
        en: 'Checking document readiness for analysis',
      },
    },
    phase_1: {
      ru: 'Классификация',
      en: 'Classification',
      description: {
        ru: 'Определение категории и темы курса',
        en: 'Determining course category and topic',
      },
    },
    phase_2: {
      ru: 'Планирование объёма',
      en: 'Scope Planning',
      description: {
        ru: 'Расчёт количества уроков и модулей',
        en: 'Calculating lessons and modules count',
      },
    },
    phase_3: {
      ru: 'Экспертный анализ',
      en: 'Expert Analysis',
      description: {
        ru: 'Глубокий анализ и выбор педагогической стратегии',
        en: 'Deep analysis and pedagogical strategy selection',
      },
    },
    phase_4: {
      ru: 'Синтез документов',
      en: 'Document Synthesis',
      description: {
        ru: 'Анализ загруженных материалов и создание рекомендаций',
        en: 'Analyzing uploaded materials and creating recommendations',
      },
    },
    phase_6: {
      ru: 'RAG-планирование',
      en: 'RAG Planning',
      description: {
        ru: 'Связывание документов с модулями курса',
        en: 'Mapping documents to course modules',
      },
    },
    phase_5: {
      ru: 'Финализация',
      en: 'Finalization',
      description: {
        ru: 'Сборка итогового результата анализа',
        en: 'Assembling final analysis result',
      },
    },
  },
  stage_5: {
    validate_input: {
      ru: 'Валидация',
      en: 'Validation',
      description: {
        ru: 'Проверка входных данных',
        en: 'Input data validation',
      },
    },
    generate_metadata: {
      ru: 'Метаданные',
      en: 'Metadata',
      description: {
        ru: 'Генерация описания и характеристик курса',
        en: 'Generating course description and properties',
      },
    },
    generate_sections: {
      ru: 'Структура',
      en: 'Structure',
      description: {
        ru: 'Создание модулей и уроков курса',
        en: 'Creating course modules and lessons',
      },
    },
    validate_quality: {
      ru: 'Проверка качества',
      en: 'Quality Check',
      description: {
        ru: 'Валидация по образовательным стандартам',
        en: 'Validation against educational standards',
      },
    },
    validate_lessons: {
      ru: 'Проверка уроков',
      en: 'Lessons Check',
      description: {
        ru: 'Проверка минимального количества уроков',
        en: 'Checking minimum lessons requirement',
      },
    },
  },
};

export function getPhaseName(stageId: string, phaseId: string, locale: 'ru' | 'en' = 'ru'): string {
  return PHASE_NAMES[stageId]?.[phaseId]?.[locale] ?? phaseId;
}

export function getPhaseDescription(stageId: string, phaseId: string, locale: 'ru' | 'en' = 'ru'): string {
  return PHASE_NAMES[stageId]?.[phaseId]?.description[locale] ?? '';
}
