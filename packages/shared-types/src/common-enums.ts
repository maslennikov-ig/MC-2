/**
 * Common Enum Schemas - Single Source of Truth
 * @module common-enums
 *
 * This module provides shared Zod enum schemas used across the platform.
 * All other packages should import from here (or via @megacampus/shared-types).
 */

import { z } from 'zod';

// ============================================================================
// Language Enum
// ============================================================================

/**
 * Language enum schema - all supported languages
 *
 * Languages supported:
 * - ru: Russian, en: English, zh: Chinese, es: Spanish
 * - fr: French, de: German, ja: Japanese, ko: Korean
 * - ar: Arabic, pt: Portuguese, it: Italian, tr: Turkish
 * - vi: Vietnamese, th: Thai, id: Indonesian, ms: Malay
 * - hi: Hindi, bn: Bengali, pl: Polish
 */
export const languageSchema = z.enum([
  'ru',
  'en',
  'zh',
  'es',
  'fr',
  'de',
  'ja',
  'ko',
  'ar',
  'pt',
  'it',
  'tr',
  'vi',
  'th',
  'id',
  'ms',
  'hi',
  'bn',
  'pl',
]);

/** Inferred Language type from schema */
export type Language = z.infer<typeof languageSchema>;

/** Array of all supported languages */
export const SUPPORTED_LANGUAGES = languageSchema.options;

/**
 * Language code to full name mapping for LLM prompts
 * Full names help LLMs understand target language better than ISO codes
 */
export const LANGUAGE_NAMES: Record<Language, string> = {
  ru: 'Russian',
  en: 'English',
  zh: 'Chinese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  pt: 'Portuguese',
  it: 'Italian',
  tr: 'Turkish',
  vi: 'Vietnamese',
  th: 'Thai',
  id: 'Indonesian',
  ms: 'Malay',
  hi: 'Hindi',
  bn: 'Bengali',
  pl: 'Polish',
};

/**
 * Get full language name from ISO code
 * Falls back to English for unknown codes
 *
 * @param code - ISO 639-1 language code (e.g., 'ru', 'en', 'zh')
 * @returns Full language name in English (e.g., 'Russian', 'English', 'Chinese')
 */
export function getLanguageName(code: string): string {
  const name = LANGUAGE_NAMES[code as Language];
  if (!name && process.env.NODE_ENV === 'development') {
    console.warn(`[getLanguageName] Unknown language code: "${code}", falling back to English`);
  }
  return name || LANGUAGE_NAMES.en;
}

/**
 * Content labels for lesson structure - localized for all 19 languages
 * Used for section headers and exercise formatting
 */
export const CONTENT_LABELS: Record<
  Language,
  {
    introduction: string;
    summary: string;
    examples: string;
    exercises: string;
    exercise: string;
    task: string;
    scenario: string;
    yourAnswer: string;
    hint: string;
    hints: string;
    sampleAnswer: string;
    lessonDigest: string;
    calloutNote: string;
    calloutTip: string;
    calloutWarning: string;
    calloutDanger: string;
    calloutInfo: string;
  }
> = {
  ru: {
    introduction: 'Введение',
    summary: 'Заключение',
    examples: 'Примеры',
    exercises: 'Упражнения',
    exercise: 'Упражнение',
    task: 'Задание',
    scenario: 'Сценарий',
    yourAnswer: 'Ваш ответ',
    hint: 'Подсказка',
    hints: 'Подсказки',
    sampleAnswer: 'Образец ответа',
    lessonDigest: 'Краткое содержание урока',
    calloutNote: 'На заметку',
    calloutTip: 'Совет',
    calloutWarning: 'Внимание',
    calloutDanger: 'Важно',
    calloutInfo: 'Информация',
  },
  en: {
    introduction: 'Introduction',
    summary: 'Summary',
    examples: 'Examples',
    exercises: 'Exercises',
    exercise: 'Exercise',
    task: 'Task',
    scenario: 'Scenario',
    yourAnswer: 'Your Answer',
    hint: 'Hint',
    hints: 'Hints',
    sampleAnswer: 'Sample Answer',
    lessonDigest: 'Lesson Digest',
    calloutNote: 'Note',
    calloutTip: 'Tip',
    calloutWarning: 'Warning',
    calloutDanger: 'Danger',
    calloutInfo: 'Info',
  },
  zh: {
    introduction: '引言',
    summary: '总结',
    examples: '示例',
    exercises: '练习',
    exercise: '练习',
    task: '任务',
    scenario: '场景',
    yourAnswer: '你的答案',
    hint: '提示',
    hints: '提示',
    sampleAnswer: '参考答案',
    lessonDigest: '课程摘要',
    calloutNote: '注意',
    calloutTip: '提示',
    calloutWarning: '警告',
    calloutDanger: '危险',
    calloutInfo: '信息',
  },
  es: {
    introduction: 'Introducción',
    summary: 'Resumen',
    examples: 'Ejemplos',
    exercises: 'Ejercicios',
    exercise: 'Ejercicio',
    task: 'Tarea',
    scenario: 'Escenario',
    yourAnswer: 'Tu respuesta',
    hint: 'Pista',
    hints: 'Pistas',
    sampleAnswer: 'Respuesta de ejemplo',
    lessonDigest: 'Resumen de la lección',
    calloutNote: 'Nota',
    calloutTip: 'Consejo',
    calloutWarning: 'Advertencia',
    calloutDanger: 'Peligro',
    calloutInfo: 'Información',
  },
  fr: {
    introduction: 'Introduction',
    summary: 'Résumé',
    examples: 'Exemples',
    exercises: 'Exercices',
    exercise: 'Exercice',
    task: 'Tâche',
    scenario: 'Scénario',
    yourAnswer: 'Votre réponse',
    hint: 'Indice',
    hints: 'Indices',
    sampleAnswer: 'Exemple de réponse',
    lessonDigest: 'Résumé de la leçon',
    calloutNote: 'Remarque',
    calloutTip: 'Conseil',
    calloutWarning: 'Attention',
    calloutDanger: 'Danger',
    calloutInfo: 'Information',
  },
  de: {
    introduction: 'Einführung',
    summary: 'Zusammenfassung',
    examples: 'Beispiele',
    exercises: 'Übungen',
    exercise: 'Übung',
    task: 'Aufgabe',
    scenario: 'Szenario',
    yourAnswer: 'Ihre Antwort',
    hint: 'Hinweis',
    hints: 'Hinweise',
    sampleAnswer: 'Musterantwort',
    lessonDigest: 'Lektionszusammenfassung',
    calloutNote: 'Hinweis',
    calloutTip: 'Tipp',
    calloutWarning: 'Warnung',
    calloutDanger: 'Gefahr',
    calloutInfo: 'Information',
  },
  ja: {
    introduction: 'はじめに',
    summary: 'まとめ',
    examples: '例',
    exercises: '演習',
    exercise: '演習',
    task: '課題',
    scenario: 'シナリオ',
    yourAnswer: 'あなたの回答',
    hint: 'ヒント',
    hints: 'ヒント',
    sampleAnswer: '解答例',
    lessonDigest: 'レッスンの要約',
    calloutNote: '注記',
    calloutTip: 'ヒント',
    calloutWarning: '警告',
    calloutDanger: '危険',
    calloutInfo: '情報',
  },
  ko: {
    introduction: '소개',
    summary: '요약',
    examples: '예시',
    exercises: '연습문제',
    exercise: '연습',
    task: '과제',
    scenario: '시나리오',
    yourAnswer: '당신의 답변',
    hint: '힌트',
    hints: '힌트',
    sampleAnswer: '모범 답안',
    lessonDigest: '수업 요약',
    calloutNote: '참고',
    calloutTip: '팁',
    calloutWarning: '주의',
    calloutDanger: '위험',
    calloutInfo: '정보',
  },
  ar: {
    introduction: 'مقدمة',
    summary: 'ملخص',
    examples: 'أمثلة',
    exercises: 'تمارين',
    exercise: 'تمرين',
    task: 'مهمة',
    scenario: 'سيناريو',
    yourAnswer: 'إجابتك',
    hint: 'تلميح',
    hints: 'تلميحات',
    sampleAnswer: 'نموذج الإجابة',
    lessonDigest: 'ملخص الدرس',
    calloutNote: 'ملاحظة',
    calloutTip: 'نصيحة',
    calloutWarning: 'تحذير',
    calloutDanger: 'خطر',
    calloutInfo: 'معلومة',
  },
  pt: {
    introduction: 'Introdução',
    summary: 'Resumo',
    examples: 'Exemplos',
    exercises: 'Exercícios',
    exercise: 'Exercício',
    task: 'Tarefa',
    scenario: 'Cenário',
    yourAnswer: 'Sua resposta',
    hint: 'Dica',
    hints: 'Dicas',
    sampleAnswer: 'Resposta modelo',
    lessonDigest: 'Resumo da lição',
    calloutNote: 'Nota',
    calloutTip: 'Dica',
    calloutWarning: 'Aviso',
    calloutDanger: 'Perigo',
    calloutInfo: 'Informação',
  },
  it: {
    introduction: 'Introduzione',
    summary: 'Riepilogo',
    examples: 'Esempi',
    exercises: 'Esercizi',
    exercise: 'Esercizio',
    task: 'Compito',
    scenario: 'Scenario',
    yourAnswer: 'La tua risposta',
    hint: 'Suggerimento',
    hints: 'Suggerimenti',
    sampleAnswer: 'Risposta di esempio',
    lessonDigest: 'Riepilogo della lezione',
    calloutNote: 'Nota',
    calloutTip: 'Suggerimento',
    calloutWarning: 'Attenzione',
    calloutDanger: 'Pericolo',
    calloutInfo: 'Informazione',
  },
  tr: {
    introduction: 'Giriş',
    summary: 'Özet',
    examples: 'Örnekler',
    exercises: 'Alıştırmalar',
    exercise: 'Alıştırma',
    task: 'Görev',
    scenario: 'Senaryo',
    yourAnswer: 'Cevabınız',
    hint: 'İpucu',
    hints: 'İpuçları',
    sampleAnswer: 'Örnek Cevap',
    lessonDigest: 'Ders Özeti',
    calloutNote: 'Not',
    calloutTip: 'İpucu',
    calloutWarning: 'Uyarı',
    calloutDanger: 'Tehlike',
    calloutInfo: 'Bilgi',
  },
  vi: {
    introduction: 'Giới thiệu',
    summary: 'Tóm tắt',
    examples: 'Ví dụ',
    exercises: 'Bài tập',
    exercise: 'Bài tập',
    task: 'Nhiệm vụ',
    scenario: 'Tình huống',
    yourAnswer: 'Câu trả lời của bạn',
    hint: 'Gợi ý',
    hints: 'Gợi ý',
    sampleAnswer: 'Đáp án mẫu',
    lessonDigest: 'Tóm tắt bài học',
    calloutNote: 'Ghi chú',
    calloutTip: 'Mẹo',
    calloutWarning: 'Cảnh báo',
    calloutDanger: 'Nguy hiểm',
    calloutInfo: 'Thông tin',
  },
  th: {
    introduction: 'บทนำ',
    summary: 'สรุป',
    examples: 'ตัวอย่าง',
    exercises: 'แบบฝึกหัด',
    exercise: 'แบบฝึกหัด',
    task: 'งาน',
    scenario: 'สถานการณ์',
    yourAnswer: 'คำตอบของคุณ',
    hint: 'คำใบ้',
    hints: 'คำใบ้',
    sampleAnswer: 'ตัวอย่างคำตอบ',
    lessonDigest: 'สรุปบทเรียน',
    calloutNote: 'หมายเหตุ',
    calloutTip: 'เคล็ดลับ',
    calloutWarning: 'คำเตือน',
    calloutDanger: 'อันตราย',
    calloutInfo: 'ข้อมูล',
  },
  id: {
    introduction: 'Pendahuluan',
    summary: 'Ringkasan',
    examples: 'Contoh',
    exercises: 'Latihan',
    exercise: 'Latihan',
    task: 'Tugas',
    scenario: 'Skenario',
    yourAnswer: 'Jawaban Anda',
    hint: 'Petunjuk',
    hints: 'Petunjuk',
    sampleAnswer: 'Contoh Jawaban',
    lessonDigest: 'Ringkasan Pelajaran',
    calloutNote: 'Catatan',
    calloutTip: 'Tips',
    calloutWarning: 'Peringatan',
    calloutDanger: 'Bahaya',
    calloutInfo: 'Informasi',
  },
  ms: {
    introduction: 'Pengenalan',
    summary: 'Ringkasan',
    examples: 'Contoh',
    exercises: 'Latihan',
    exercise: 'Latihan',
    task: 'Tugasan',
    scenario: 'Senario',
    yourAnswer: 'Jawapan Anda',
    hint: 'Petunjuk',
    hints: 'Petunjuk',
    sampleAnswer: 'Contoh Jawapan',
    lessonDigest: 'Ringkasan Pelajaran',
    calloutNote: 'Nota',
    calloutTip: 'Petua',
    calloutWarning: 'Amaran',
    calloutDanger: 'Bahaya',
    calloutInfo: 'Maklumat',
  },
  hi: {
    introduction: 'परिचय',
    summary: 'सारांश',
    examples: 'उदाहरण',
    exercises: 'अभ्यास',
    exercise: 'अभ्यास',
    task: 'कार्य',
    scenario: 'परिदृश्य',
    yourAnswer: 'आपका उत्तर',
    hint: 'संकेत',
    hints: 'संकेत',
    sampleAnswer: 'नमूना उत्तर',
    lessonDigest: 'पाठ सारांश',
    calloutNote: 'टिप्पणी',
    calloutTip: 'सुझाव',
    calloutWarning: 'चेतावनी',
    calloutDanger: 'खतरा',
    calloutInfo: 'जानकारी',
  },
  bn: {
    introduction: 'ভূমিকা',
    summary: 'সারসংক্ষেপ',
    examples: 'উদাহরণ',
    exercises: 'অনুশীলন',
    exercise: 'অনুশীলন',
    task: 'কাজ',
    scenario: 'পরিস্থিতি',
    yourAnswer: 'আপনার উত্তর',
    hint: 'ইঙ্গিত',
    hints: 'ইঙ্গিত',
    sampleAnswer: 'নমুনা উত্তর',
    lessonDigest: 'পাঠ সারাংশ',
    calloutNote: 'টীকা',
    calloutTip: 'পরামর্শ',
    calloutWarning: 'সতর্কতা',
    calloutDanger: 'বিপদ',
    calloutInfo: 'তথ্য',
  },
  pl: {
    introduction: 'Wprowadzenie',
    summary: 'Podsumowanie',
    examples: 'Przykłady',
    exercises: 'Ćwiczenia',
    exercise: 'Ćwiczenie',
    task: 'Zadanie',
    scenario: 'Scenariusz',
    yourAnswer: 'Twoja odpowiedź',
    hint: 'Wskazówka',
    hints: 'Wskazówki',
    sampleAnswer: 'Przykładowa odpowiedź',
    lessonDigest: 'Podsumowanie lekcji',
    calloutNote: 'Uwaga',
    calloutTip: 'Wskazówka',
    calloutWarning: 'Ostrzeżenie',
    calloutDanger: 'Niebezpieczeństwo',
    calloutInfo: 'Informacja',
  },
};

/**
 * Get content labels for a specific language
 * Falls back to English for unknown language codes
 *
 * @param code - ISO 639-1 language code
 * @returns Content labels object for the specified language
 */
export function getContentLabels(code: string): typeof CONTENT_LABELS.en {
  const labels = CONTENT_LABELS[code as Language];
  if (!labels && process.env.NODE_ENV === 'development') {
    console.warn(`[getContentLabels] Unknown language code: "${code}", falling back to English`);
  }
  return labels || CONTENT_LABELS.en;
}

/**
 * Validate and normalize a language code
 * Returns a valid Language code or 'en' as fallback
 *
 * @param code - Language code to validate (may be undefined/null/invalid)
 * @returns Valid Language code
 */
export function validateLanguageCode(code: unknown): Language {
  const parsed = languageSchema.safeParse(code);
  return parsed.success ? parsed.data : 'en';
}

// ============================================================================
// Difficulty/Level Enum
// ============================================================================

/**
 * Difficulty enum schema - includes expert level
 */
export const difficultySchema = z.enum(['beginner', 'intermediate', 'advanced', 'expert']);

/** Inferred Difficulty type from schema */
export type Difficulty = z.infer<typeof difficultySchema>;

/** Array of all difficulty levels */
export const DIFFICULTY_LEVELS = difficultySchema.options;

// ============================================================================
// Course Level Enum
// ============================================================================

/**
 * Course level schema - subset of difficulty (excludes expert)
 * Used in courseSettingsSchema and similar contexts
 */
export const courseLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);

/** Inferred CourseLevel type from schema */
export type CourseLevel = z.infer<typeof courseLevelSchema>;

/** Array of all course levels */
export const COURSE_LEVELS = courseLevelSchema.options;

// ============================================================================
// Generation Status Constants (Issue #10 from code review)
// ============================================================================

/**
 * Generation statuses that allow pausing
 * Used to determine if a course can be paused during generation
 */
export const PAUSABLE_STATUSES = [
  'stage_2_init',
  'stage_2_processing',
  'stage_3_init',
  'stage_3_summarizing',
  'stage_4_init',
  'stage_4_analyzing',
  'stage_5_init',
  'stage_5_generating',
  'stage_6_init',
  'stage_6_generating',
] as const;

/** Type for pausable generation statuses */
export type PausableStatus = (typeof PAUSABLE_STATUSES)[number];

/**
 * Generation statuses that allow cancellation
 * Includes all pausable statuses plus additional early statuses
 */
export const CANCELLABLE_STATUSES = [
  ...PAUSABLE_STATUSES,
  'pending',
  'initializing',
  'generating',
  'processing_documents',
  'document_processing',
  'generating_structure',
  'finalizing',
] as const;

/** Type for cancellable generation statuses */
export type CancellableStatus = (typeof CANCELLABLE_STATUSES)[number];

/**
 * Check if a generation status allows pausing
 * @param status - The current generation status
 */
export function canPauseGeneration(status: string | null | undefined): boolean {
  return PAUSABLE_STATUSES.includes(status as PausableStatus);
}

/**
 * Check if a generation status allows cancellation
 * @param status - The current generation status
 */
export function canCancelGeneration(status: string | null | undefined): boolean {
  return CANCELLABLE_STATUSES.includes(status as CancellableStatus);
}
