/**
 * QuizPlayer Component - Usage Examples
 *
 * This file demonstrates how to use the QuizPlayer component
 * with different quiz configurations.
 */

import { QuizPlayer } from "./QuizPlayer";
import type { QuizEnrichmentContent } from "@megacampus/shared-types";

/**
 * Example 1: Basic Multiple Choice Quiz
 */
export function BasicQuizExample() {
  const quizContent: QuizEnrichmentContent = {
    type: "quiz",
    quiz_title: "JavaScript Основы",
    instructions: "Ответьте на вопросы, чтобы проверить свои знания JavaScript",
    questions: [
      {
        id: "q1",
        type: "multiple_choice",
        bloom_level: "remember",
        difficulty: "easy",
        question: "Какой оператор используется для объявления переменной в JavaScript?",
        options: [
          { id: "a", text: "var" },
          { id: "b", text: "let" },
          { id: "c", text: "const" },
          { id: "d", text: "Все вышеперечисленное" },
        ],
        correct_answer: "d",
        explanation:
          "В JavaScript можно использовать var, let и const для объявления переменных. let и const появились в ES6 и являются более современными.",
        points: 1,
      },
      {
        id: "q2",
        type: "multiple_choice",
        bloom_level: "understand",
        difficulty: "medium",
        question: "Что выведет console.log(typeof null)?",
        options: [
          { id: "a", text: "null" },
          { id: "b", text: "object" },
          { id: "c", text: "undefined" },
          { id: "d", text: "number" },
        ],
        correct_answer: "b",
        explanation:
          "typeof null возвращает 'object' - это известная особенность JavaScript, которая существует с первых версий языка.",
        points: 2,
      },
    ],
    passing_score: 70,
    shuffle_questions: false,
    shuffle_options: true,
    metadata: {
      total_points: 3,
      estimated_minutes: 5,
      bloom_coverage: {
        remember: 1,
        understand: 1,
        apply: 0,
        analyze: 0,
      },
    },
  };

  const handleComplete = (score: number, totalPoints: number, passed: boolean) => {
    console.log("Quiz completed!", { score, totalPoints, passed });
    // Save progress to backend or localStorage
  };

  return <QuizPlayer content={quizContent} enrichmentId="example-basic-quiz" onComplete={handleComplete} />;
}

/**
 * Example 2: True/False Quiz
 */
export function TrueFalseQuizExample() {
  const quizContent: QuizEnrichmentContent = {
    type: "quiz",
    quiz_title: "React Правда или Ложь",
    instructions: "Определите, верны ли следующие утверждения о React",
    questions: [
      {
        id: "q1",
        type: "true_false",
        bloom_level: "understand",
        difficulty: "easy",
        question: "React - это фреймворк для создания пользовательских интерфейсов",
        correct_answer: false,
        explanation:
          "React - это библиотека, а не фреймворк. Фреймворки, такие как Next.js, построены на основе React.",
        points: 1,
      },
      {
        id: "q2",
        type: "true_false",
        bloom_level: "remember",
        difficulty: "easy",
        question: "JSX является обязательным для работы с React",
        correct_answer: false,
        explanation:
          "JSX не является обязательным, но он делает код более читаемым. Можно использовать React.createElement() напрямую.",
        points: 1,
      },
    ],
    passing_score: 80,
    time_limit_minutes: 3,
    shuffle_questions: true,
    shuffle_options: false,
    metadata: {
      total_points: 2,
      estimated_minutes: 3,
      bloom_coverage: {
        remember: 1,
        understand: 1,
        apply: 0,
        analyze: 0,
      },
    },
  };

  return <QuizPlayer content={quizContent} enrichmentId="example-true-false-quiz" />;
}

/**
 * Example 3: Short Answer Quiz
 */
export function ShortAnswerQuizExample() {
  const quizContent: QuizEnrichmentContent = {
    type: "quiz",
    quiz_title: "TypeScript Терминология",
    instructions: "Введите краткие ответы на следующие вопросы",
    questions: [
      {
        id: "q1",
        type: "short_answer",
        bloom_level: "remember",
        difficulty: "easy",
        question: "Какое расширение файла используется для TypeScript?",
        correct_answer: ".ts",
        explanation:
          "TypeScript файлы используют расширение .ts для обычных файлов и .tsx для файлов с JSX.",
        points: 1,
      },
      {
        id: "q2",
        type: "short_answer",
        bloom_level: "apply",
        difficulty: "medium",
        question:
          "Какой ключевое слово используется для определения типа в TypeScript?",
        correct_answer: "type",
        explanation:
          "Ключевое слово 'type' используется для создания алиасов типов. Также можно использовать 'interface' для объектных типов.",
        points: 2,
      },
    ],
    passing_score: 60,
    shuffle_questions: false,
    shuffle_options: false,
    metadata: {
      total_points: 3,
      estimated_minutes: 4,
      bloom_coverage: {
        remember: 1,
        understand: 0,
        apply: 1,
        analyze: 0,
      },
    },
  };

  return <QuizPlayer content={quizContent} enrichmentId="example-short-answer-quiz" />;
}

/**
 * Example 4: Mixed Question Types Quiz
 */
export function MixedQuizExample() {
  const quizContent: QuizEnrichmentContent = {
    type: "quiz",
    quiz_title: "Комплексный тест по веб-разработке",
    instructions:
      "Этот тест содержит различные типы вопросов для проверки ваших знаний",
    questions: [
      {
        id: "q1",
        type: "multiple_choice",
        bloom_level: "understand",
        difficulty: "medium",
        question: "Какой HTTP метод используется для обновления ресурса?",
        options: [
          { id: "a", text: "GET" },
          { id: "b", text: "POST" },
          { id: "c", text: "PUT" },
          { id: "d", text: "DELETE" },
        ],
        correct_answer: "c",
        explanation:
          "PUT используется для полного обновления ресурса. PATCH используется для частичного обновления.",
        points: 2,
      },
      {
        id: "q2",
        type: "true_false",
        bloom_level: "remember",
        difficulty: "easy",
        question: "CSS означает Cascading Style Sheets",
        correct_answer: true,
        explanation: "CSS действительно расшифровывается как Cascading Style Sheets.",
        points: 1,
      },
      {
        id: "q3",
        type: "short_answer",
        bloom_level: "apply",
        difficulty: "hard",
        question: "Какой метод массива используется для преобразования каждого элемента?",
        correct_answer: "map",
        explanation:
          "Метод map() создает новый массив с результатами вызова функции для каждого элемента.",
        points: 3,
      },
    ],
    passing_score: 70,
    time_limit_minutes: 10,
    shuffle_questions: true,
    shuffle_options: true,
    metadata: {
      total_points: 6,
      estimated_minutes: 10,
      bloom_coverage: {
        remember: 1,
        understand: 1,
        apply: 1,
        analyze: 0,
      },
    },
  };

  return <QuizPlayer content={quizContent} enrichmentId="example-mixed-quiz" />;
}

/**
 * Example 5: Integration with Lesson Enrichments
 *
 * This example shows how to integrate QuizPlayer with the Course Viewer
 */
export function LessonEnrichmentIntegration() {
  // This would typically come from the database via props
  const enrichmentRow = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    lesson_id: "1.2",
    enrichment_type: "quiz" as const,
    status: "completed" as const,
    title: "Тест по основам программирования",
    content: {
      type: "quiz" as const,
      quiz_title: "Тест по основам программирования",
      instructions: "Проверьте свои знания основ программирования",
      questions: [
        // ... questions array
      ],
      passing_score: 70,
      shuffle_questions: false,
      shuffle_options: false,
      metadata: {
        total_points: 10,
        estimated_minutes: 15,
        bloom_coverage: {
          remember: 3,
          understand: 2,
          apply: 1,
          analyze: 0,
        },
      },
    },
  };

  // Type guard to ensure content is QuizEnrichmentContent
  if (enrichmentRow.content.type === "quiz") {
    return (
      <div className="p-6">
        <QuizPlayer
          content={enrichmentRow.content}
          enrichmentId={enrichmentRow.id}
          onComplete={(score, totalPoints, passed) => {
            // Save quiz results to backend
            console.log("Saving quiz results:", {
              enrichmentId: enrichmentRow.id,
              lessonId: enrichmentRow.lesson_id,
              score,
              totalPoints,
              passed,
              completedAt: new Date().toISOString(),
            });
          }}
        />
      </div>
    );
  }

  return null;
}
