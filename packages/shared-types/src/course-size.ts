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
 * - auto: LLM decides optimal size based on topic (DEFAULT)
 * - micro: Minimal course for simple topics (1-5 lessons)
 * - mini: Quick overview, express introduction (8-12 lessons)
 * - compact: Small focused course (15-25 lessons)
 * - standard: Typical comprehensive course (30-50 lessons)
 * - comprehensive: Large detailed course with advanced topics (60-100 lessons)
 */
export const COURSE_SIZES = [
  'auto',
  'micro',
  'mini',
  'compact',
  'standard',
  'comprehensive',
] as const;

/** Inferred CourseSize type from array */
export type CourseSize = (typeof COURSE_SIZES)[number];

/** Zod schema for course size validation */
export const courseSizeSchema = z.enum(COURSE_SIZES);

/** Sizes that have explicit presets (excludes 'auto') */
export const PRESET_COURSE_SIZES = [
  'micro',
  'mini',
  'compact',
  'standard',
  'comprehensive',
] as const;
export type PresetCourseSize = (typeof PRESET_COURSE_SIZES)[number];

// ============================================================================
// SIZE PRESETS WITH TARGET VALUES
// ============================================================================

export interface CourseSizePreset {
  /** Size identifier */
  size: PresetCourseSize;
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
 * Note: 'auto' is not included - it means LLM decides without guidance
 */
export const COURSE_SIZE_PRESETS: Record<PresetCourseSize, CourseSizePreset> = {
  micro: {
    size: 'micro',
    targetLessons: 3,
    targetSections: 1,
    estimatedHoursMin: 0.25,
    estimatedHoursMax: 1,
    llmGuidance:
      'Create a minimal micro-course with 1-5 lessons in 1 section. ' +
      'This is for very simple topics that need only the absolute essentials. ' +
      'Cover only the core concept - no background, no advanced topics, just the minimum viable knowledge.',
  },
  mini: {
    size: 'mini',
    targetLessons: 10,
    targetSections: 3,
    estimatedHoursMin: 1,
    estimatedHoursMax: 3,
    llmGuidance:
      'Create a quick overview course with 8-12 lessons in 3 sections. ' +
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
    auto: {
      title: 'Оптимальный',
      subtitle: 'ИИ-анализ',
      description: 'Размер на основе анализа темы',
    },
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
    auto: {
      title: 'Optimal',
      subtitle: 'AI Analysis',
      description: 'Size based on topic analysis',
    },
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
    auto: { title: '最优', subtitle: 'AI分析', description: '基于主题分析的大小' },
    mini: { title: '速成', subtitle: '~10课', description: '快速概览课程' },
    compact: { title: '精简', subtitle: '~20课', description: '小型专注课程' },
    standard: { title: '标准', subtitle: '~40课', description: '典型完整课程' },
    comprehensive: { title: '全面', subtitle: '~80课', description: '大型详细课程' },
  },
  es: {
    auto: {
      title: 'Óptimo',
      subtitle: 'Análisis IA',
      description: 'Tamaño basado en análisis del tema',
    },
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
    auto: {
      title: 'Optimal',
      subtitle: 'Analyse IA',
      description: "Taille basée sur l'analyse du sujet",
    },
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
    auto: {
      title: 'Optimal',
      subtitle: 'KI-Analyse',
      description: 'Größe basierend auf Themenanalyse',
    },
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
    auto: { title: '最適', subtitle: 'AI分析', description: 'トピック分析に基づくサイズ' },
    mini: { title: 'エクスプレス', subtitle: '~10レッスン', description: 'クイック概要コース' },
    compact: { title: 'コンパクト', subtitle: '~20レッスン', description: '小規模集中コース' },
    standard: { title: 'スタンダード', subtitle: '~40レッスン', description: '標準的な総合コース' },
    comprehensive: { title: '総合', subtitle: '~80レッスン', description: '大規模詳細コース' },
  },
  ko: {
    auto: { title: '최적', subtitle: 'AI 분석', description: '주제 분석 기반 크기' },
    mini: { title: '익스프레스', subtitle: '~10강', description: '빠른 개요 코스' },
    compact: { title: '컴팩트', subtitle: '~20강', description: '소규모 집중 코스' },
    standard: { title: '스탠다드', subtitle: '~40강', description: '일반 종합 코스' },
    comprehensive: { title: '종합', subtitle: '~80강', description: '대규모 상세 코스' },
  },
  ar: {
    auto: { title: 'الأمثل', subtitle: 'تحليل AI', description: 'الحجم بناءً على تحليل الموضوع' },
    mini: { title: 'سريع', subtitle: '~10 دروس', description: 'دورة نظرة عامة سريعة' },
    compact: { title: 'مختصر', subtitle: '~20 درس', description: 'دورة صغيرة مركزة' },
    standard: { title: 'قياسي', subtitle: '~40 درس', description: 'دورة شاملة نموذجية' },
    comprehensive: { title: 'شامل', subtitle: '~80 درس', description: 'دورة كبيرة مفصلة' },
  },
  pt: {
    auto: {
      title: 'Ótimo',
      subtitle: 'Análise IA',
      description: 'Tamanho baseado em análise do tema',
    },
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
    auto: {
      title: 'Ottimale',
      subtitle: 'Analisi IA',
      description: 'Dimensione basata su analisi del tema',
    },
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
    auto: { title: 'Optimal', subtitle: 'AI Analizi', description: 'Konu analizine dayalı boyut' },
    mini: { title: 'Ekspres', subtitle: '~10 ders', description: 'Hızlı genel bakış kursu' },
    compact: { title: 'Kompakt', subtitle: '~20 ders', description: 'Küçük odaklı kurs' },
    standard: { title: 'Standart', subtitle: '~40 ders', description: 'Tipik kapsamlı kurs' },
    comprehensive: { title: 'Kapsamlı', subtitle: '~80 ders', description: 'Büyük detaylı kurs' },
  },
  vi: {
    auto: {
      title: 'Tối ưu',
      subtitle: 'Phân tích AI',
      description: 'Kích thước dựa trên phân tích chủ đề',
    },
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
    auto: {
      title: 'เหมาะสมที่สุด',
      subtitle: 'AI วิเคราะห์',
      description: 'ขนาดจากการวิเคราะห์หัวข้อ',
    },
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
    auto: {
      title: 'Optimal',
      subtitle: 'Analisis AI',
      description: 'Ukuran berdasarkan analisis topik',
    },
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
    auto: {
      title: 'Optimum',
      subtitle: 'Analisis AI',
      description: 'Saiz berdasarkan analisis topik',
    },
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
    auto: { title: 'इष्टतम', subtitle: 'AI विश्लेषण', description: 'विषय विश्लेषण पर आधारित आकार' },
    mini: { title: 'एक्सप्रेस', subtitle: '~10 पाठ', description: 'त्वरित अवलोकन पाठ्यक्रम' },
    compact: { title: 'संक्षिप्त', subtitle: '~20 पाठ', description: 'छोटा केंद्रित पाठ्यक्रम' },
    standard: { title: 'मानक', subtitle: '~40 पाठ', description: 'विशिष्ट व्यापक पाठ्यक्रम' },
    comprehensive: { title: 'व्यापक', subtitle: '~80 पाठ', description: 'बड़ा विस्तृत पाठ्यक्रम' },
  },
  bn: {
    auto: {
      title: 'সর্বোত্তম',
      subtitle: 'AI বিশ্লেষণ',
      description: 'বিষয় বিশ্লেষণের উপর ভিত্তি করে আকার',
    },
    mini: { title: 'এক্সপ্রেস', subtitle: '~১০ পাঠ', description: 'দ্রুত ওভারভিউ কোর্স' },
    compact: { title: 'সংক্ষিপ্ত', subtitle: '~২০ পাঠ', description: 'ছোট ফোকাসড কোর্স' },
    standard: { title: 'স্ট্যান্ডার্ড', subtitle: '~৪০ পাঠ', description: 'সাধারণ সম্পূর্ণ কোর্স' },
    comprehensive: { title: 'বিস্তারিত', subtitle: '~৮০ পাঠ', description: 'বড় বিস্তারিত কোর্স' },
  },
  pl: {
    auto: {
      title: 'Optymalny',
      subtitle: 'Analiza AI',
      description: 'Rozmiar oparty na analizie tematu',
    },
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
 * Returns undefined for 'auto' (LLM decides without guidance)
 * @param size - Course size identifier
 */
export function getCourseSizePreset(size: CourseSize): CourseSizePreset | undefined {
  if (size === 'auto') return undefined;
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
 * 'auto' lets LLM analyze topic and decide optimal structure
 */
export const DEFAULT_COURSE_SIZE: CourseSize = 'auto';

// ============================================================================
// UI LABELS FOR COURSE SIZE SELECTOR (i18n)
// ============================================================================

export interface CourseSizeUILabels {
  /** Section title */
  sectionTitle: string;
  /** Legend for screen readers */
  legendText: string;
  /** Advisory note at bottom */
  advisoryNote: string;
  /** Helper text when auto is selected */
  autoHelperText: string;
}

/**
 * Localized UI labels for CourseSizeSelector component
 * Supports all 19 platform languages
 */
export const COURSE_SIZE_UI_LABELS: Record<Language, CourseSizeUILabels> = {
  ru: {
    sectionTitle: 'Размер курса',
    legendText: 'Выберите размер курса',
    advisoryNote: 'Это рекомендация - фактический размер может отличаться',
    autoHelperText:
      'ИИ автоматически определит оптимальный размер курса на основе анализа темы и загруженных материалов.',
  },
  en: {
    sectionTitle: 'Course Size',
    legendText: 'Select course size',
    advisoryNote: 'This is a recommendation - actual size may vary',
    autoHelperText:
      'AI will automatically determine optimal course size based on topic analysis and uploaded materials.',
  },
  zh: {
    sectionTitle: '课程规模',
    legendText: '选择课程规模',
    advisoryNote: '这是建议 - 实际规模可能有所不同',
    autoHelperText: 'AI将根据主题分析和上传的材料自动确定最佳课程规模。',
  },
  es: {
    sectionTitle: 'Tamaño del curso',
    legendText: 'Seleccionar tamaño del curso',
    advisoryNote: 'Esta es una recomendación - el tamaño real puede variar',
    autoHelperText:
      'La IA determinará automáticamente el tamaño óptimo del curso según el análisis del tema y los materiales cargados.',
  },
  fr: {
    sectionTitle: 'Taille du cours',
    legendText: 'Sélectionner la taille du cours',
    advisoryNote: 'Ceci est une recommandation - la taille réelle peut varier',
    autoHelperText:
      "L'IA déterminera automatiquement la taille optimale du cours en fonction de l'analyse du sujet et des documents téléchargés.",
  },
  de: {
    sectionTitle: 'Kursgröße',
    legendText: 'Kursgröße auswählen',
    advisoryNote: 'Dies ist eine Empfehlung - die tatsächliche Größe kann variieren',
    autoHelperText:
      'KI wird die optimale Kursgröße basierend auf der Themenanalyse und hochgeladenen Materialien automatisch bestimmen.',
  },
  ja: {
    sectionTitle: 'コースサイズ',
    legendText: 'コースサイズを選択',
    advisoryNote: 'これは推奨です - 実際のサイズは異なる場合があります',
    autoHelperText:
      'AIがトピック分析とアップロードされた資料に基づいて最適なコースサイズを自動的に決定します。',
  },
  ko: {
    sectionTitle: '코스 크기',
    legendText: '코스 크기 선택',
    advisoryNote: '이것은 권장 사항입니다 - 실제 크기는 다를 수 있습니다',
    autoHelperText:
      'AI가 주제 분석과 업로드된 자료를 바탕으로 최적의 코스 크기를 자동으로 결정합니다.',
  },
  ar: {
    sectionTitle: 'حجم الدورة',
    legendText: 'اختر حجم الدورة',
    advisoryNote: 'هذه توصية - قد يختلف الحجم الفعلي',
    autoHelperText:
      'سيحدد الذكاء الاصطناعي تلقائيًا الحجم الأمثل للدورة بناءً على تحليل الموضوع والمواد المرفوعة.',
  },
  pt: {
    sectionTitle: 'Tamanho do curso',
    legendText: 'Selecionar tamanho do curso',
    advisoryNote: 'Esta é uma recomendação - o tamanho real pode variar',
    autoHelperText:
      'A IA determinará automaticamente o tamanho ideal do curso com base na análise do tema e nos materiais carregados.',
  },
  it: {
    sectionTitle: 'Dimensione del corso',
    legendText: 'Seleziona dimensione del corso',
    advisoryNote: 'Questa è una raccomandazione - la dimensione effettiva può variare',
    autoHelperText:
      "L'IA determinerà automaticamente la dimensione ottimale del corso in base all'analisi dell'argomento e ai materiali caricati.",
  },
  tr: {
    sectionTitle: 'Kurs boyutu',
    legendText: 'Kurs boyutunu seçin',
    advisoryNote: 'Bu bir öneridir - gerçek boyut farklı olabilir',
    autoHelperText:
      'AI, konu analizi ve yüklenen materyallere göre en uygun kurs boyutunu otomatik olarak belirleyecektir.',
  },
  vi: {
    sectionTitle: 'Quy mô khóa học',
    legendText: 'Chọn quy mô khóa học',
    advisoryNote: 'Đây là khuyến nghị - quy mô thực tế có thể khác',
    autoHelperText:
      'AI sẽ tự động xác định quy mô khóa học tối ưu dựa trên phân tích chủ đề và tài liệu đã tải lên.',
  },
  th: {
    sectionTitle: 'ขนาดหลักสูตร',
    legendText: 'เลือกขนาดหลักสูตร',
    advisoryNote: 'นี่เป็นคำแนะนำ - ขนาดจริงอาจแตกต่างกัน',
    autoHelperText:
      'AI จะกำหนดขนาดหลักสูตรที่เหมาะสมโดยอัตโนมัติตามการวิเคราะห์หัวข้อและเอกสารที่อัปโหลด',
  },
  id: {
    sectionTitle: 'Ukuran kursus',
    legendText: 'Pilih ukuran kursus',
    advisoryNote: 'Ini adalah rekomendasi - ukuran sebenarnya dapat bervariasi',
    autoHelperText:
      'AI akan secara otomatis menentukan ukuran kursus yang optimal berdasarkan analisis topik dan materi yang diunggah.',
  },
  ms: {
    sectionTitle: 'Saiz kursus',
    legendText: 'Pilih saiz kursus',
    advisoryNote: 'Ini adalah cadangan - saiz sebenar mungkin berbeza',
    autoHelperText:
      'AI akan menentukan saiz kursus optimum secara automatik berdasarkan analisis topik dan bahan yang dimuat naik.',
  },
  hi: {
    sectionTitle: 'कोर्स का आकार',
    legendText: 'कोर्स का आकार चुनें',
    advisoryNote: 'यह एक सिफारिश है - वास्तविक आकार भिन्न हो सकता है',
    autoHelperText:
      'AI विषय विश्लेषण और अपलोड की गई सामग्री के आधार पर स्वचालित रूप से इष्टतम कोर्स आकार निर्धारित करेगा।',
  },
  bn: {
    sectionTitle: 'কোর্সের আকার',
    legendText: 'কোর্সের আকার নির্বাচন করুন',
    advisoryNote: 'এটি একটি সুপারিশ - প্রকৃত আকার ভিন্ন হতে পারে',
    autoHelperText:
      'AI বিষয় বিশ্লেষণ এবং আপলোড করা উপকরণের উপর ভিত্তি করে স্বয়ংক্রিয়ভাবে সর্বোত্তম কোর্সের আকার নির্ধারণ করবে।',
  },
  pl: {
    sectionTitle: 'Rozmiar kursu',
    legendText: 'Wybierz rozmiar kursu',
    advisoryNote: 'To jest zalecenie - rzeczywisty rozmiar może się różnić',
    autoHelperText:
      'AI automatycznie określi optymalny rozmiar kursu na podstawie analizy tematu i przesłanych materiałów.',
  },
};

/**
 * Get localized UI labels for CourseSizeSelector
 * Falls back to English for unknown language codes
 */
export function getCourseSizeUILabels(language: string): CourseSizeUILabels {
  const labels = COURSE_SIZE_UI_LABELS[language as Language];
  return labels || COURSE_SIZE_UI_LABELS.en;
}
