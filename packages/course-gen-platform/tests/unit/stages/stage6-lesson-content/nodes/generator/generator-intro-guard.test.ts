import { describe, expect, it } from 'vitest';
import { CONTENT_LABELS, SUPPORTED_LANGUAGES, type Language } from '@megacampus/shared-types';
import { validateIntroStructure } from '@/stages/stage6-lesson-content/nodes/generator/generator-intro-guard';

const LOCALIZED_TEASERS = {
  ru: 'В следующем уроке мы соберём полную модель.',
  en: 'In the next lesson, we will build the complete model.',
  zh: '下一课我们将构建完整的模型。',
  es: 'En la próxima lección construiremos el modelo completo.',
  fr: 'Dans la prochaine leçon, nous construirons le modèle complet.',
  de: 'In der nächsten Lektion erstellen wir das vollständige Modell.',
  ja: '次のレッスンでは、完全なモデルを作ります。',
  ko: '다음 수업에서는 완전한 모델을 만듭니다.',
  ar: 'في الدرس التالي سنبني النموذج الكامل.',
  pt: 'Na próxima lição, construiremos o modelo completo.',
  it: 'Nella prossima lezione costruiremo il modello completo.',
  tr: 'Sonraki derste tam modeli oluşturacağız.',
  vi: 'Trong bài học tiếp theo, chúng ta sẽ xây dựng mô hình hoàn chỉnh.',
  th: 'ในบทเรียนถัดไป เราจะสร้างแบบจำลองที่สมบูรณ์',
  id: 'Di pelajaran berikutnya, kita akan membangun model lengkap.',
  ms: 'Dalam pelajaran seterusnya, kita akan membina model lengkap.',
  hi: 'अगले पाठ में हम पूरा मॉडल बनाएँगे।',
  bn: 'পরবর্তী পাঠে আমরা সম্পূর্ণ মডেল তৈরি করব।',
  pl: 'W następnej lekcji zbudujemy pełny model.',
} satisfies Record<Language, string>;

const NORMAL_TRANSITIONS = {
  ru: 'Далее применим формулу к этому примеру.',
  en: 'Next, apply the formula to this example.',
  zh: '接下来，我们把公式应用到这个例子中。',
  es: 'A continuación, aplicamos la fórmula a este ejemplo.',
  fr: 'Ensuite, appliquons la formule à cet exemple.',
  de: 'Als Nächstes wenden wir die Formel auf dieses Beispiel an.',
  ja: '次に、この例に式を適用します。',
  ko: '이제 이 예제에 공식을 적용합니다.',
  ar: 'بعد ذلك نطبق الصيغة على هذا المثال.',
  pt: 'Em seguida, aplicamos a fórmula a este exemplo.',
  it: 'Ora applichiamo la formula a questo esempio.',
  tr: 'Şimdi formülü bu örneğe uygulayalım.',
  vi: 'Tiếp theo, áp dụng công thức cho ví dụ này.',
  th: 'ต่อไป ลองใช้สูตรกับตัวอย่างนี้',
  id: 'Selanjutnya, terapkan rumus pada contoh ini.',
  ms: 'Seterusnya, gunakan formula pada contoh ini.',
  hi: 'अब इस उदाहरण पर सूत्र लागू करें।',
  bn: 'এবার এই উদাহরণে সূত্রটি প্রয়োগ করি।',
  pl: 'Następnie zastosujmy wzór do tego przykładu.',
} satisfies Record<Language, string>;

function validateLocalizedIntro(body: string, language: Language, nextLessonTitle?: string) {
  const introHeader = CONTENT_LABELS[language].introduction;
  return validateIntroStructure(
    `# Lesson title\n\n## ${introHeader}\n\n${body}`,
    introHeader,
    nextLessonTitle,
    language
  );
}

describe('validateIntroStructure localized teaser detection', () => {
  it.each(SUPPORTED_LANGUAGES)('rejects an explicit future-lesson teaser in %s', language => {
    const result = validateLocalizedIntro(LOCALIZED_TEASERS[language], language);

    expect(result.issues).toContain('NEXT_LESSON_TEASER');
  });

  it.each(SUPPORTED_LANGUAGES)('accepts a normal same-lesson transition in %s', language => {
    const result = validateLocalizedIntro(NORMAL_TRANSITIONS[language], language);

    expect(result.issues).not.toContain('NEXT_LESSON_TEASER');
  });

  it('keeps exact next-lesson-title matching language-independent', () => {
    const result = validateLocalizedIntro(
      'Сначала закрепим основу. Теория графов будет разобрана отдельно.',
      'zh',
      'Теория графов'
    );

    expect(result.issues).toContain('NEXT_LESSON_TEASER');
  });

  it('uses the English teaser patterns for an unknown language code', () => {
    const introHeader = CONTENT_LABELS.en.introduction;
    const result = validateIntroStructure(
      `## ${introHeader}\n\nIn the next lesson, we will build the complete model.`,
      introHeader,
      null,
      'unknown'
    );

    expect(result.issues).toContain('NEXT_LESSON_TEASER');
  });
});
