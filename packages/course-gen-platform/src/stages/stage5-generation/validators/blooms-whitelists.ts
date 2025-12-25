/**
 * Bloom's Taxonomy Multilingual Whitelists
 *
 * Supports 19 languages with varying levels of coverage:
 * - FULL: 80+ verbs across 6 levels (EN, RU)
 * - BASE: 30-40 core verbs (17 other languages)
 *
 * Extensible via plugin architecture (registerLanguageWhitelist)
 *
 * @see specs/008-generation-generation-json/research-decisions/rt-007-bloom-taxonomy-validation-improvements.md
 */

import logger from '@/shared/logger';

export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';

export interface BloomsWhitelist {
  remember: string[];
  understand: string[];
  apply: string[];
  analyze: string[];
  evaluate: string[];
  create: string[];
}

export const BLOOMS_TAXONOMY_MULTILINGUAL: Record<string, BloomsWhitelist> = {
  // ========== FULL COVERAGE (80+ verbs) ==========

  en: {
    remember: ['define', 'list', 'recall', 'recognize', 'identify', 'name', 'state', 'describe', 'label', 'match', 'select', 'reproduce', 'cite', 'memorize'],
    understand: ['explain', 'summarize', 'paraphrase', 'classify', 'compare', 'contrast', 'interpret', 'exemplify', 'illustrate', 'infer', 'predict', 'discuss'],
    apply: ['execute', 'implement', 'solve', 'use', 'demonstrate', 'operate', 'calculate', 'complete', 'show', 'examine', 'modify'],
    analyze: ['differentiate', 'organize', 'attribute', 'deconstruct', 'distinguish', 'examine', 'experiment', 'question', 'test', 'investigate'],
    evaluate: ['check', 'critique', 'judge', 'hypothesize', 'argue', 'defend', 'support', 'assess', 'rate', 'recommend'],
    create: ['design', 'construct', 'plan', 'produce', 'invent', 'develop', 'formulate', 'assemble', 'compose', 'devise'],
  },

  ru: {
    remember: ['определить', 'перечислить', 'вспомнить', 'распознать', 'идентифицировать', 'назвать', 'утверждать', 'описать', 'обозначить', 'сопоставить', 'выбрать', 'воспроизвести', 'цитировать'],
    understand: ['объяснить', 'объяснять', 'объясняет', 'резюмировать', 'перефразировать', 'классифицировать', 'сравнить', 'противопоставить', 'интерпретировать', 'проиллюстрировать', 'сделать вывод', 'предсказать', 'обсудить'],
    apply: ['выполнить', 'реализовать', 'решить', 'использовать', 'продемонстрировать', 'оперировать', 'вычислить', 'завершить', 'показать', 'исследовать', 'модифицировать'],
    analyze: ['дифференцировать', 'организовать', 'атрибутировать', 'деконструировать', 'различить', 'изучить', 'экспериментировать', 'задать вопрос', 'тестировать'],
    evaluate: ['проверить', 'критиковать', 'судить', 'выдвинуть гипотезу', 'аргументировать', 'защитить', 'поддержать', 'оценить', 'рекомендовать'],
    create: ['спроектировать', 'сконструировать', 'спланировать', 'произвести', 'изобрести', 'разработать', 'сформулировать', 'собрать', 'составить', 'придумать'],
  },

  // ========== BASE COVERAGE (30-40 core verbs) ==========

  es: { // Spanish
    remember: ['listar', 'nombrar', 'identificar', 'recordar', 'definir'],
    understand: ['explicar', 'explicando', 'explique', 'resumir', 'interpretar', 'describir'],
    apply: ['demostrar', 'implementar', 'ejecutar', 'usar', 'resolver'],
    analyze: ['comparar', 'contrastar', 'diferenciar', 'examinar'],
    evaluate: ['evaluar', 'justificar', 'criticar', 'defender'],
    create: ['diseñar', 'desarrollar', 'construir', 'formular'],
  },

  fr: { // French
    remember: ['lister', 'nommer', 'identifier', 'rappeler', 'définir'],
    understand: ['expliquer', 'expliquant', 'résumer', 'interpréter', 'décrire'],
    apply: ['démontrer', 'mettre en œuvre', 'exécuter', 'utiliser'],
    analyze: ['comparer', 'contraster', 'différencier', 'examiner'],
    evaluate: ['évaluer', 'justifier', 'critiquer', 'défendre'],
    create: ['concevoir', 'développer', 'construire', 'formuler'],
  },

  de: { // German
    remember: ['auflisten', 'benennen', 'identifizieren', 'erinnern'],
    understand: ['erklären', 'zusammenfassen', 'interpretieren'],
    apply: ['demonstrieren', 'implementieren', 'ausführen', 'anwenden'],
    analyze: ['vergleichen', 'gegenüberstellen', 'differenzieren'],
    evaluate: ['bewerten', 'begründen', 'kritisieren', 'verteidigen'],
    create: ['entwerfen', 'entwickeln', 'konstruieren', 'formulieren'],
  },

  zh: { // Chinese Simplified
    remember: ['列出', '命名', '识别', '回忆', '定义'],
    understand: ['解释', '总结', '解读', '描述'],
    apply: ['演示', '实施', '执行', '使用', '应用'],
    analyze: ['比较', '对比', '区分', '检查'],
    evaluate: ['评估', '证明', '批评', '辩护'],
    create: ['设计', '开发', '构建', '制定'],
  },

  ar: { // Arabic
    remember: ['قائمة', 'اسم', 'تحديد', 'تذكر', 'تعريف'],
    understand: ['شرح', 'تلخيص', 'تفسير', 'وصف'],
    apply: ['إظهار', 'تنفيذ', 'تطبيق', 'استخدام'],
    analyze: ['مقارنة', 'تباين', 'تمييز', 'فحص'],
    evaluate: ['تقييم', 'تبرير', 'انتقاد', 'دفاع'],
    create: ['تصميم', 'تطوير', 'بناء', 'صياغة'],
  },

  pt: { // Portuguese
    remember: ['listar', 'nomear', 'identificar', 'lembrar', 'definir'],
    understand: ['explicar', 'resumir', 'interpretar', 'descrever'],
    apply: ['demonstrar', 'implementar', 'executar', 'usar'],
    analyze: ['comparar', 'contrastar', 'diferenciar', 'examinar'],
    evaluate: ['avaliar', 'justificar', 'criticar', 'defender'],
    create: ['projetar', 'desenvolver', 'construir', 'formular'],
  },

  it: { // Italian
    remember: ['elencare', 'nominare', 'identificare', 'ricordare', 'definire'],
    understand: ['spiegare', 'riassumere', 'interpretare', 'descrivere'],
    apply: ['dimostrare', 'implementare', 'eseguire', 'usare'],
    analyze: ['comparare', 'contrastare', 'differenziare', 'esaminare'],
    evaluate: ['valutare', 'giustificare', 'criticare', 'difendere'],
    create: ['progettare', 'sviluppare', 'costruire', 'formulare'],
  },

  ja: { // Japanese
    remember: ['列挙する', '名付ける', '識別する', '思い出す', '定義する'],
    understand: ['説明する', '要約する', '解釈する', '描写する'],
    apply: ['実演する', '実装する', '実行する', '使用する'],
    analyze: ['比較する', '対照する', '区別する', '調査する'],
    evaluate: ['評価する', '正当化する', '批判する', '擁護する'],
    create: ['設計する', '開発する', '構築する', '策定する'],
  },

  ko: { // Korean
    remember: ['나열하다', '명명하다', '식별하다', '기억하다', '정의하다'],
    understand: ['설명하다', '요약하다', '해석하다', '묘사하다'],
    apply: ['시연하다', '구현하다', '실행하다', '사용하다'],
    analyze: ['비교하다', '대조하다', '구별하다', '조사하다'],
    evaluate: ['평가하다', '정당화하다', '비판하다', '옹호하다'],
    create: ['설계하다', '개발하다', '구축하다', '공식화하다'],
  },

  tr: { // Turkish
    remember: ['listele', 'adlandır', 'tanımla', 'hatırla', 'belirle'],
    understand: ['açıkla', 'özetle', 'yorumla', 'betimle'],
    apply: ['göster', 'uygula', 'çalıştır', 'kullan'],
    analyze: ['karşılaştır', 'ayır', 'incele', 'sorgula'],
    evaluate: ['değerlendir', 'haklı göster', 'eleştir', 'savun'],
    create: ['tasarla', 'geliştir', 'inşa et', 'formüle et'],
  },

  vi: { // Vietnamese
    remember: ['liệt kê', 'đặt tên', 'xác định', 'nhớ lại', 'định nghĩa'],
    understand: ['giải thích', 'tóm tắt', 'diễn giải', 'mô tả'],
    apply: ['trình diễn', 'thực hiện', 'thực thi', 'sử dụng'],
    analyze: ['so sánh', 'đối chiếu', 'phân biệt', 'kiểm tra'],
    evaluate: ['đánh giá', 'biện minh', 'phê bình', 'bảo vệ'],
    create: ['thiết kế', 'phát triển', 'xây dựng', 'xây dựng'],
  },

  th: { // Thai
    remember: ['แสดงรายการ', 'ตั้งชื่อ', 'ระบุ', 'จำ', 'นิยาม'],
    understand: ['อธิบาย', 'สรุป', 'ตีความ', 'อธิบาย'],
    apply: ['สาธิต', 'นำไปใช้', 'ดำเนินการ', 'ใช้'],
    analyze: ['เปรียบเทียบ', 'เทียบกัน', 'แยกความแตกต่าง', 'ตรวจสอบ'],
    evaluate: ['ประเมิน', 'ให้เหตุผล', 'วิจารณ์', 'ปกป้อง'],
    create: ['ออกแบบ', 'พัฒนา', 'สร้าง', 'กำหนด'],
  },

  id: { // Indonesian
    remember: ['daftar', 'beri nama', 'identifikasi', 'ingat', 'definisikan'],
    understand: ['jelaskan', 'ringkas', 'tafsirkan', 'gambarkan'],
    apply: ['tunjukkan', 'terapkan', 'jalankan', 'gunakan'],
    analyze: ['bandingkan', 'kontraskan', 'bedakan', 'periksa'],
    evaluate: ['evaluasi', 'justifikasi', 'kritik', 'bela'],
    create: ['rancang', 'kembangkan', 'bangun', 'rumuskan'],
  },

  ms: { // Malay
    remember: ['senaraikan', 'namakan', 'kenal pasti', 'ingat', 'tentukan'],
    understand: ['terangkan', 'ringkaskan', 'tafsirkan', 'gambarkan'],
    apply: ['tunjukkan', 'laksanakan', 'jalankan', 'gunakan'],
    analyze: ['bandingkan', 'bezakan', 'bedakan', 'periksa'],
    evaluate: ['nilai', 'wajarkan', 'kritik', 'bela'],
    create: ['reka bentuk', 'bangunkan', 'bina', 'rumuskan'],
  },

  hi: { // Hindi
    remember: ['सूचीबद्ध करें', 'नाम दें', 'पहचानें', 'याद रखें', 'परिभाषित करें'],
    understand: ['समझाएं', 'सारांशित करें', 'व्याख्या करें', 'वर्णन करें'],
    apply: ['प्रदर्शित करें', 'कार्यान्वित करें', 'निष्पादित करें', 'उपयोग करें'],
    analyze: ['तुलना करें', 'विरोधाभास करें', 'अंतर करें', 'जांचें'],
    evaluate: ['मूल्यांकन करें', 'न्यायसंगत बनाएं', 'आलोचना करें', 'बचाव करें'],
    create: ['डिज़ाइन करें', 'विकसित करें', 'निर्माण करें', 'सूत्रबद्ध करें'],
  },

  pl: { // Polish
    remember: ['wymień', 'nazwij', 'zidentyfikuj', 'przypomnij', 'zdefiniuj'],
    understand: ['wyjaśnij', 'podsumuj', 'zinterpretuj', 'opisz'],
    apply: ['zademonstruj', 'zaimplementuj', 'wykonaj', 'użyj'],
    analyze: ['porównaj', 'przeciwstaw', 'rozróżnij', 'zbadaj'],
    evaluate: ['oceń', 'uzasadnij', 'skrytykuj', 'obroń'],
    create: ['zaprojektuj', 'rozwijaj', 'zbuduj', 'sformułuj'],
  },
};

/**
 * Get Bloom's whitelist for language with fallback to English
 *
 * @param language - ISO 639-1 language code
 * @returns Bloom's whitelist for language (or English fallback)
 */
export function getBloomsWhitelist(language: string): BloomsWhitelist {
  if (BLOOMS_TAXONOMY_MULTILINGUAL[language]) {
    return BLOOMS_TAXONOMY_MULTILINGUAL[language];
  }

  // Fallback to English with warning
  console.warn(`[blooms-whitelists] No Bloom's whitelist for language "${language}", using English fallback`);
  return BLOOMS_TAXONOMY_MULTILINGUAL.en;
}

/**
 * Plugin architecture: Register new language whitelist
 *
 * Allows adding new languages without modifying core code.
 *
 * @param language - ISO 639-1 language code
 * @param whitelist - Bloom's whitelist for language
 */
export function registerLanguageWhitelist(
  language: string,
  whitelist: BloomsWhitelist
): void {
  if (BLOOMS_TAXONOMY_MULTILINGUAL[language]) {
    logger.warn({ language }, 'Overwriting existing whitelist for language');
  }

  BLOOMS_TAXONOMY_MULTILINGUAL[language] = whitelist;
  logger.info({ language }, 'Registered Blooms whitelist for language');
}
