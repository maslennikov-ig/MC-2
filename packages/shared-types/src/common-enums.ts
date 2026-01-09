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
  'ru', 'en', 'zh', 'es', 'fr', 'de', 'ja', 'ko',
  'ar', 'pt', 'it', 'tr', 'vi', 'th', 'id', 'ms',
  'hi', 'bn', 'pl'
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
export const CONTENT_LABELS: Record<Language, {
  introduction: string;
  summary: string;
  exercises: string;
  exercise: string;
  task: string;
  scenario: string;
  yourAnswer: string;
  hint: string;
  sampleAnswer: string;
}> = {
  ru: {
    introduction: 'Введение',
    summary: 'Заключение',
    exercises: 'Упражнения',
    exercise: 'Упражнение',
    task: 'Задание',
    scenario: 'Сценарий',
    yourAnswer: 'Ваш ответ',
    hint: 'Подсказка',
    sampleAnswer: 'Образец ответа',
  },
  en: {
    introduction: 'Introduction',
    summary: 'Summary',
    exercises: 'Exercises',
    exercise: 'Exercise',
    task: 'Task',
    scenario: 'Scenario',
    yourAnswer: 'Your Answer',
    hint: 'Hint',
    sampleAnswer: 'Sample Answer',
  },
  zh: {
    introduction: '引言',
    summary: '总结',
    exercises: '练习',
    exercise: '练习',
    task: '任务',
    scenario: '场景',
    yourAnswer: '你的答案',
    hint: '提示',
    sampleAnswer: '参考答案',
  },
  es: {
    introduction: 'Introducción',
    summary: 'Resumen',
    exercises: 'Ejercicios',
    exercise: 'Ejercicio',
    task: 'Tarea',
    scenario: 'Escenario',
    yourAnswer: 'Tu respuesta',
    hint: 'Pista',
    sampleAnswer: 'Respuesta de ejemplo',
  },
  fr: {
    introduction: 'Introduction',
    summary: 'Résumé',
    exercises: 'Exercices',
    exercise: 'Exercice',
    task: 'Tâche',
    scenario: 'Scénario',
    yourAnswer: 'Votre réponse',
    hint: 'Indice',
    sampleAnswer: 'Exemple de réponse',
  },
  de: {
    introduction: 'Einführung',
    summary: 'Zusammenfassung',
    exercises: 'Übungen',
    exercise: 'Übung',
    task: 'Aufgabe',
    scenario: 'Szenario',
    yourAnswer: 'Ihre Antwort',
    hint: 'Hinweis',
    sampleAnswer: 'Musterantwort',
  },
  ja: {
    introduction: 'はじめに',
    summary: 'まとめ',
    exercises: '演習',
    exercise: '演習',
    task: '課題',
    scenario: 'シナリオ',
    yourAnswer: 'あなたの回答',
    hint: 'ヒント',
    sampleAnswer: '解答例',
  },
  ko: {
    introduction: '소개',
    summary: '요약',
    exercises: '연습문제',
    exercise: '연습',
    task: '과제',
    scenario: '시나리오',
    yourAnswer: '당신의 답변',
    hint: '힌트',
    sampleAnswer: '모범 답안',
  },
  ar: {
    introduction: 'مقدمة',
    summary: 'ملخص',
    exercises: 'تمارين',
    exercise: 'تمرين',
    task: 'مهمة',
    scenario: 'سيناريو',
    yourAnswer: 'إجابتك',
    hint: 'تلميح',
    sampleAnswer: 'نموذج الإجابة',
  },
  pt: {
    introduction: 'Introdução',
    summary: 'Resumo',
    exercises: 'Exercícios',
    exercise: 'Exercício',
    task: 'Tarefa',
    scenario: 'Cenário',
    yourAnswer: 'Sua resposta',
    hint: 'Dica',
    sampleAnswer: 'Resposta modelo',
  },
  it: {
    introduction: 'Introduzione',
    summary: 'Riepilogo',
    exercises: 'Esercizi',
    exercise: 'Esercizio',
    task: 'Compito',
    scenario: 'Scenario',
    yourAnswer: 'La tua risposta',
    hint: 'Suggerimento',
    sampleAnswer: 'Risposta di esempio',
  },
  tr: {
    introduction: 'Giriş',
    summary: 'Özet',
    exercises: 'Alıştırmalar',
    exercise: 'Alıştırma',
    task: 'Görev',
    scenario: 'Senaryo',
    yourAnswer: 'Cevabınız',
    hint: 'İpucu',
    sampleAnswer: 'Örnek Cevap',
  },
  vi: {
    introduction: 'Giới thiệu',
    summary: 'Tóm tắt',
    exercises: 'Bài tập',
    exercise: 'Bài tập',
    task: 'Nhiệm vụ',
    scenario: 'Tình huống',
    yourAnswer: 'Câu trả lời của bạn',
    hint: 'Gợi ý',
    sampleAnswer: 'Đáp án mẫu',
  },
  th: {
    introduction: 'บทนำ',
    summary: 'สรุป',
    exercises: 'แบบฝึกหัด',
    exercise: 'แบบฝึกหัด',
    task: 'งาน',
    scenario: 'สถานการณ์',
    yourAnswer: 'คำตอบของคุณ',
    hint: 'คำใบ้',
    sampleAnswer: 'ตัวอย่างคำตอบ',
  },
  id: {
    introduction: 'Pendahuluan',
    summary: 'Ringkasan',
    exercises: 'Latihan',
    exercise: 'Latihan',
    task: 'Tugas',
    scenario: 'Skenario',
    yourAnswer: 'Jawaban Anda',
    hint: 'Petunjuk',
    sampleAnswer: 'Contoh Jawaban',
  },
  ms: {
    introduction: 'Pengenalan',
    summary: 'Ringkasan',
    exercises: 'Latihan',
    exercise: 'Latihan',
    task: 'Tugasan',
    scenario: 'Senario',
    yourAnswer: 'Jawapan Anda',
    hint: 'Petunjuk',
    sampleAnswer: 'Contoh Jawapan',
  },
  hi: {
    introduction: 'परिचय',
    summary: 'सारांश',
    exercises: 'अभ्यास',
    exercise: 'अभ्यास',
    task: 'कार्य',
    scenario: 'परिदृश्य',
    yourAnswer: 'आपका उत्तर',
    hint: 'संकेत',
    sampleAnswer: 'नमूना उत्तर',
  },
  bn: {
    introduction: 'ভূমিকা',
    summary: 'সারসংক্ষেপ',
    exercises: 'অনুশীলন',
    exercise: 'অনুশীলন',
    task: 'কাজ',
    scenario: 'পরিস্থিতি',
    yourAnswer: 'আপনার উত্তর',
    hint: 'ইঙ্গিত',
    sampleAnswer: 'নমুনা উত্তর',
  },
  pl: {
    introduction: 'Wprowadzenie',
    summary: 'Podsumowanie',
    exercises: 'Ćwiczenia',
    exercise: 'Ćwiczenie',
    task: 'Zadanie',
    scenario: 'Scenariusz',
    yourAnswer: 'Twoja odpowiedź',
    hint: 'Wskazówka',
    sampleAnswer: 'Przykładowa odpowiedź',
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
