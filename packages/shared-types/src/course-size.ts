/**
 * Course Size Presets - Single Source of Truth
 * @module course-size
 *
 * Defines available course size presets for LLM recommendations.
 * These are ADVISORY - LLM may deviate if topic requires different scope.
 */

import { z } from 'zod';
import type { Language } from './common-enums';

// ============================================================================
// COURSE SIZE ENUM
// ============================================================================

/**
 * Course size options:
 * - mini: Quick overview, express introduction (~10 lessons)
 * - compact: Small focused course (~20 lessons)
 * - standard: Typical comprehensive course (~40 lessons)
 * - comprehensive: Large detailed course with advanced topics (~80 lessons)
 */
export const COURSE_SIZES = ['mini', 'compact', 'standard', 'comprehensive'] as const;

/** Inferred CourseSize type from array */
export type CourseSize = (typeof COURSE_SIZES)[number];

/** Zod schema for course size validation */
export const courseSizeSchema = z.enum(COURSE_SIZES);

// ============================================================================
// SIZE PRESETS WITH TARGET VALUES
// ============================================================================

export interface CourseSizePreset {
  /** Size identifier */
  size: CourseSize;
  /** Target lessons count (recommendation, not constraint) */
  targetLessons: number;
  /** Target sections count (recommendation, not constraint) */
  targetSections: number;
  /** Estimated hours range minimum (for UI display) */
  estimatedHoursMin: number;
  /** Estimated hours range maximum (for UI display) */
  estimatedHoursMax: number;
  /** Description for LLM prompt (English, will be adapted by LLM) */
  llmGuidance: string;
}

/**
 * Course size presets with target values
 * These are recommendations - actual course structure may vary based on topic
 */
export const COURSE_SIZE_PRESETS: Record<CourseSize, CourseSizePreset> = {
  mini: {
    size: 'mini',
    targetLessons: 10,
    targetSections: 3,
    estimatedHoursMin: 1,
    estimatedHoursMax: 3,
    llmGuidance:
      'Create a quick overview course with approximately 10 lessons in 3 sections. ' +
      'Focus on essential concepts only - this is an express introduction, not comprehensive coverage. ' +
      'Keep explanations concise and skip advanced topics.',
  },
  compact: {
    size: 'compact',
    targetLessons: 20,
    targetSections: 5,
    estimatedHoursMin: 3,
    estimatedHoursMax: 8,
    llmGuidance:
      'Create a compact course with approximately 20 lessons in 5 sections. ' +
      'Cover core concepts with moderate depth. Include practical examples but avoid extensive case studies. ' +
      'Skip very advanced or niche topics.',
  },
  standard: {
    size: 'standard',
    targetLessons: 40,
    targetSections: 8,
    estimatedHoursMin: 8,
    estimatedHoursMax: 20,
    llmGuidance:
      'Create a standard-sized course with approximately 40 lessons in 8 sections. ' +
      'Provide thorough coverage with practical examples, exercises, and some advanced topics. ' +
      'Balance breadth and depth appropriately for the subject matter.',
  },
  comprehensive: {
    size: 'comprehensive',
    targetLessons: 80,
    targetSections: 15,
    estimatedHoursMin: 20,
    estimatedHoursMax: 50,
    llmGuidance:
      'Create a comprehensive course with approximately 80 lessons in 15 sections. ' +
      'Provide in-depth coverage including advanced topics, extensive examples, case studies, and practical projects. ' +
      'Include edge cases, best practices, and expert-level insights.',
  },
};

// ============================================================================
// I18N LABELS (19 languages)
// ============================================================================

export interface CourseSizeLabel {
  /** Display title (e.g., "Express", "Compact") */
  title: string;
  /** Subtitle with lesson count (e.g., "~10 lessons") */
  subtitle: string;
  /** Short description (e.g., "Quick overview course") */
  description: string;
}

/**
 * Localized labels for course size presets
 * Supports all 19 platform languages
 */
export const COURSE_SIZE_LABELS: Record<Language, Record<CourseSize, CourseSizeLabel>> = {
  ru: {
    mini: { title: 'Экспресс', subtitle: '~10 уроков', description: 'Быстрый обзорный курс' },
    compact: {
      title: 'Компактный',
      subtitle: '~20 уроков',
      description: 'Небольшой фокусированный курс',
    },
    standard: {
      title: 'Стандартный',
      subtitle: '~40 уроков',
      description: 'Типичный полноценный курс',
    },
    comprehensive: {
      title: 'Полный',
      subtitle: '~80 уроков',
      description: 'Большой подробный курс',
    },
  },
  en: {
    mini: { title: 'Express', subtitle: '~10 lessons', description: 'Quick overview course' },
    compact: { title: 'Compact', subtitle: '~20 lessons', description: 'Small focused course' },
    standard: {
      title: 'Standard',
      subtitle: '~40 lessons',
      description: 'Typical comprehensive course',
    },
    comprehensive: {
      title: 'Comprehensive',
      subtitle: '~80 lessons',
      description: 'Large detailed course',
    },
  },
  zh: {
    mini: { title: '速成', subtitle: '~10课', description: '快速概览课程' },
    compact: { title: '精简', subtitle: '~20课', description: '小型专注课程' },
    standard: { title: '标准', subtitle: '~40课', description: '典型完整课程' },
    comprehensive: { title: '全面', subtitle: '~80课', description: '大型详细课程' },
  },
  es: {
    mini: { title: 'Exprés', subtitle: '~10 lecciones', description: 'Curso de vista rápida' },
    compact: {
      title: 'Compacto',
      subtitle: '~20 lecciones',
      description: 'Curso pequeño enfocado',
    },
    standard: {
      title: 'Estándar',
      subtitle: '~40 lecciones',
      description: 'Curso completo típico',
    },
    comprehensive: {
      title: 'Completo',
      subtitle: '~80 lecciones',
      description: 'Curso grande detallado',
    },
  },
  fr: {
    mini: { title: 'Express', subtitle: '~10 leçons', description: 'Cours aperçu rapide' },
    compact: { title: 'Compact', subtitle: '~20 leçons', description: 'Petit cours ciblé' },
    standard: { title: 'Standard', subtitle: '~40 leçons', description: 'Cours complet typique' },
    comprehensive: {
      title: 'Complet',
      subtitle: '~80 leçons',
      description: 'Grand cours détaillé',
    },
  },
  de: {
    mini: { title: 'Express', subtitle: '~10 Lektionen', description: 'Schneller Überblickskurs' },
    compact: {
      title: 'Kompakt',
      subtitle: '~20 Lektionen',
      description: 'Kleiner fokussierter Kurs',
    },
    standard: {
      title: 'Standard',
      subtitle: '~40 Lektionen',
      description: 'Typischer umfassender Kurs',
    },
    comprehensive: {
      title: 'Umfassend',
      subtitle: '~80 Lektionen',
      description: 'Großer detaillierter Kurs',
    },
  },
  ja: {
    mini: { title: 'エクスプレス', subtitle: '~10レッスン', description: 'クイック概要コース' },
    compact: { title: 'コンパクト', subtitle: '~20レッスン', description: '小規模集中コース' },
    standard: { title: 'スタンダード', subtitle: '~40レッスン', description: '標準的な総合コース' },
    comprehensive: { title: '総合', subtitle: '~80レッスン', description: '大規模詳細コース' },
  },
  ko: {
    mini: { title: '익스프레스', subtitle: '~10강', description: '빠른 개요 코스' },
    compact: { title: '컴팩트', subtitle: '~20강', description: '소규모 집중 코스' },
    standard: { title: '스탠다드', subtitle: '~40강', description: '일반 종합 코스' },
    comprehensive: { title: '종합', subtitle: '~80강', description: '대규모 상세 코스' },
  },
  ar: {
    mini: { title: 'سريع', subtitle: '~10 دروس', description: 'دورة نظرة عامة سريعة' },
    compact: { title: 'مختصر', subtitle: '~20 درس', description: 'دورة صغيرة مركزة' },
    standard: { title: 'قياسي', subtitle: '~40 درس', description: 'دورة شاملة نموذجية' },
    comprehensive: { title: 'شامل', subtitle: '~80 درس', description: 'دورة كبيرة مفصلة' },
  },
  pt: {
    mini: { title: 'Expresso', subtitle: '~10 aulas', description: 'Curso de visão geral rápida' },
    compact: { title: 'Compacto', subtitle: '~20 aulas', description: 'Curso pequeno focado' },
    standard: { title: 'Padrão', subtitle: '~40 aulas', description: 'Curso completo típico' },
    comprehensive: {
      title: 'Abrangente',
      subtitle: '~80 aulas',
      description: 'Curso grande detalhado',
    },
  },
  it: {
    mini: { title: 'Express', subtitle: '~10 lezioni', description: 'Corso panoramica rapida' },
    compact: {
      title: 'Compatto',
      subtitle: '~20 lezioni',
      description: 'Piccolo corso focalizzato',
    },
    standard: { title: 'Standard', subtitle: '~40 lezioni', description: 'Corso completo tipico' },
    comprehensive: {
      title: 'Completo',
      subtitle: '~80 lezioni',
      description: 'Grande corso dettagliato',
    },
  },
  tr: {
    mini: { title: 'Ekspres', subtitle: '~10 ders', description: 'Hızlı genel bakış kursu' },
    compact: { title: 'Kompakt', subtitle: '~20 ders', description: 'Küçük odaklı kurs' },
    standard: { title: 'Standart', subtitle: '~40 ders', description: 'Tipik kapsamlı kurs' },
    comprehensive: { title: 'Kapsamlı', subtitle: '~80 ders', description: 'Büyük detaylı kurs' },
  },
  vi: {
    mini: { title: 'Tốc hành', subtitle: '~10 bài', description: 'Khóa học tổng quan nhanh' },
    compact: { title: 'Gọn', subtitle: '~20 bài', description: 'Khóa học nhỏ tập trung' },
    standard: {
      title: 'Tiêu chuẩn',
      subtitle: '~40 bài',
      description: 'Khóa học toàn diện điển hình',
    },
    comprehensive: {
      title: 'Toàn diện',
      subtitle: '~80 bài',
      description: 'Khóa học lớn chi tiết',
    },
  },
  th: {
    mini: { title: 'ด่วน', subtitle: '~10 บทเรียน', description: 'หลักสูตรภาพรวมด่วน' },
    compact: {
      title: 'กะทัดรัด',
      subtitle: '~20 บทเรียน',
      description: 'หลักสูตรขนาดเล็กเน้นเฉพาะ',
    },
    standard: { title: 'มาตรฐาน', subtitle: '~40 บทเรียน', description: 'หลักสูตรครบถ้วนทั่วไป' },
    comprehensive: {
      title: 'ครอบคลุม',
      subtitle: '~80 บทเรียน',
      description: 'หลักสูตรใหญ่ละเอียด',
    },
  },
  id: {
    mini: { title: 'Kilat', subtitle: '~10 pelajaran', description: 'Kursus tinjauan cepat' },
    compact: { title: 'Ringkas', subtitle: '~20 pelajaran', description: 'Kursus kecil terfokus' },
    standard: {
      title: 'Standar',
      subtitle: '~40 pelajaran',
      description: 'Kursus lengkap tipikal',
    },
    comprehensive: {
      title: 'Lengkap',
      subtitle: '~80 pelajaran',
      description: 'Kursus besar terperinci',
    },
  },
  ms: {
    mini: {
      title: 'Ekspres',
      subtitle: '~10 pelajaran',
      description: 'Kursus gambaran keseluruhan pantas',
    },
    compact: { title: 'Padat', subtitle: '~20 pelajaran', description: 'Kursus kecil berfokus' },
    standard: {
      title: 'Standard',
      subtitle: '~40 pelajaran',
      description: 'Kursus lengkap tipikal',
    },
    comprehensive: {
      title: 'Menyeluruh',
      subtitle: '~80 pelajaran',
      description: 'Kursus besar terperinci',
    },
  },
  hi: {
    mini: { title: 'एक्सप्रेस', subtitle: '~10 पाठ', description: 'त्वरित अवलोकन पाठ्यक्रम' },
    compact: { title: 'संक्षिप्त', subtitle: '~20 पाठ', description: 'छोटा केंद्रित पाठ्यक्रम' },
    standard: { title: 'मानक', subtitle: '~40 पाठ', description: 'विशिष्ट व्यापक पाठ्यक्रम' },
    comprehensive: { title: 'व्यापक', subtitle: '~80 पाठ', description: 'बड़ा विस्तृत पाठ्यक्रम' },
  },
  bn: {
    mini: { title: 'এক্সপ্রেস', subtitle: '~১০ পাঠ', description: 'দ্রুত ওভারভিউ কোর্স' },
    compact: { title: 'সংক্ষিপ্ত', subtitle: '~২০ পাঠ', description: 'ছোট ফোকাসড কোর্স' },
    standard: { title: 'স্ট্যান্ডার্ড', subtitle: '~৪০ পাঠ', description: 'সাধারণ সম্পূর্ণ কোর্স' },
    comprehensive: { title: 'বিস্তারিত', subtitle: '~৮০ পাঠ', description: 'বড় বিস্তারিত কোর্স' },
  },
  pl: {
    mini: { title: 'Ekspres', subtitle: '~10 lekcji', description: 'Szybki kurs przeglądowy' },
    compact: {
      title: 'Kompaktowy',
      subtitle: '~20 lekcji',
      description: 'Mały skoncentrowany kurs',
    },
    standard: { title: 'Standardowy', subtitle: '~40 lekcji', description: 'Typowy pełny kurs' },
    comprehensive: {
      title: 'Kompleksowy',
      subtitle: '~80 lekcji',
      description: 'Duży szczegółowy kurs',
    },
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get course size preset configuration
 * @param size - Course size identifier
 */
export function getCourseSizePreset(size: CourseSize): CourseSizePreset {
  return COURSE_SIZE_PRESETS[size];
}

/**
 * Get localized labels for a course size
 * Falls back to English for unknown language codes
 *
 * @param language - ISO 639-1 language code
 * @param size - Course size identifier
 */
export function getCourseSizeLabels(language: string, size: CourseSize): CourseSizeLabel {
  const langLabels = COURSE_SIZE_LABELS[language as Language];
  if (langLabels) {
    return langLabels[size];
  }
  // Fallback to English
  return COURSE_SIZE_LABELS.en[size];
}

/**
 * Get all course size labels for a language
 * Falls back to English for unknown language codes
 *
 * @param language - ISO 639-1 language code
 */
export function getAllCourseSizeLabels(language: string): Record<CourseSize, CourseSizeLabel> {
  const langLabels = COURSE_SIZE_LABELS[language as Language];
  return langLabels || COURSE_SIZE_LABELS.en;
}

/**
 * Validate if a string is a valid course size
 * @param size - String to validate
 */
export function isValidCourseSize(size: string): size is CourseSize {
  return courseSizeSchema.safeParse(size).success;
}

/**
 * Default course size when user doesn't select one
 * Standard is recommended as it provides balanced coverage
 */
export const DEFAULT_COURSE_SIZE: CourseSize = 'standard';
