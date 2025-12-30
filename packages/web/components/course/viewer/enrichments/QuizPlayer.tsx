"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Trophy,
  Target,
  Clock,
  RotateCcw,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { QuizEnrichmentContent, QuizQuestion } from "@megacampus/shared-types";

interface QuizPlayerProps {
  /** Quiz enrichment content */
  content: QuizEnrichmentContent;
  /** Unique identifier for quiz progress persistence */
  enrichmentId: string;
  /** Callback when quiz is completed */
  onComplete?: (score: number, totalPoints: number, passed: boolean) => void;
}

/** localStorage key pattern for quiz progress */
const QUIZ_STORAGE_KEY = (id: string) => `quiz_progress_${id}`;

interface QuizState {
  /** Current question index (0-based) */
  currentQuestionIndex: number;
  /** User's answers: questionId -> answer */
  answers: Record<string, string | boolean>;
  /** Whether quiz is submitted */
  isSubmitted: boolean;
  /** Score achieved */
  score: number;
  /** Whether user passed */
  passed: boolean;
}

/** Default initial state for quiz */
const defaultState: QuizState = {
  currentQuestionIndex: 0,
  answers: {},
  isSubmitted: false,
  score: 0,
  passed: false,
};

/**
 * QuizPlayer Component
 *
 * Interactive quiz player for quiz enrichments with support for:
 * - Multiple choice questions
 * - True/false questions
 * - Short answer questions
 * - Score calculation and passing criteria
 * - Question navigation
 * - Answer explanations after submission
 *
 * Features:
 * - One question at a time for focused learning
 * - Progress tracking with visual indicator
 * - Difficulty and Bloom level badges
 * - Results summary with retry option
 * - Responsive design with Framer Motion animations
 * - Dark mode support
 */
export function QuizPlayer({ content, enrichmentId, onComplete }: QuizPlayerProps) {
  const t = useTranslations('enrichments');

  // Load from localStorage on mount (SSR-safe)
  const [state, setState] = useState<QuizState>(() => {
    if (typeof window === 'undefined') return defaultState;

    try {
      const saved = localStorage.getItem(QUIZ_STORAGE_KEY(enrichmentId));
      if (saved) {
        const parsed = JSON.parse(saved) as QuizState;
        // Don't restore submitted state - user should see fresh quiz after completion
        if (!parsed.isSubmitted) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load quiz progress:', e);
    }
    return defaultState;
  });

  // Loading state for score calculation
  const [isCalculating, setIsCalculating] = useState(false);

  // Save to localStorage on state change
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (state.isSubmitted) {
      // Clear saved progress on completion
      localStorage.removeItem(QUIZ_STORAGE_KEY(enrichmentId));
      return;
    }

    try {
      localStorage.setItem(QUIZ_STORAGE_KEY(enrichmentId), JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save quiz progress:', e);
    }
  }, [state, enrichmentId]);

  // Shuffle questions only once on mount using useState initializer
  const [questions] = useState(() => {
    if (content.shuffle_questions) {
      return [...content.questions].sort(() => Math.random() - 0.5);
    }
    return content.questions;
  });

  // Memoize shuffled options per question (once on mount)
  const [shuffledOptionsMap] = useState<Record<string, QuizQuestion['options']>>(() => {
    if (!content.shuffle_options) return {};

    const map: Record<string, QuizQuestion['options']> = {};
    content.questions.forEach(q => {
      if (q.options) {
        map[q.id] = [...q.options].sort(() => Math.random() - 0.5);
      }
    });
    return map;
  });

  // Get shuffled options for a question (stable reference from map)
  const getShuffledOptions = (question: QuizQuestion) => {
    if (content.shuffle_options && question.options) {
      return shuffledOptionsMap[question.id] || question.options;
    }
    return question.options || [];
  };

  const currentQuestion = questions[state.currentQuestionIndex];
  const totalQuestions = questions.length;
  const progressPercentage = ((state.currentQuestionIndex + 1) / totalQuestions) * 100;
  const isLastQuestion = state.currentQuestionIndex === totalQuestions - 1;
  const isFirstQuestion = state.currentQuestionIndex === 0;

  // Check if current question is answered
  const currentAnswer = state.answers[currentQuestion.id];
  const isCurrentAnswered = currentAnswer !== undefined && currentAnswer !== "";

  // Check if all questions are answered
  const allAnswered = questions.every(
    (q) => state.answers[q.id] !== undefined && state.answers[q.id] !== ""
  );

  const handleAnswerChange = (questionId: string, answer: string | boolean) => {
    setState((prev) => ({
      ...prev,
      answers: {
        ...prev.answers,
        [questionId]: answer,
      },
    }));
  };

  const handleNext = () => {
    if (state.currentQuestionIndex < totalQuestions - 1) {
      setState((prev) => ({
        ...prev,
        currentQuestionIndex: prev.currentQuestionIndex + 1,
      }));
    }
  };

  const handlePrevious = () => {
    if (state.currentQuestionIndex > 0) {
      setState((prev) => ({
        ...prev,
        currentQuestionIndex: prev.currentQuestionIndex - 1,
      }));
    }
  };

  const handleSubmit = async () => {
    setIsCalculating(true);

    // Brief delay for UX feedback
    await new Promise(resolve => setTimeout(resolve, 300));

    // Calculate score
    let totalScore = 0;
    let earnedPoints = 0;

    questions.forEach((question) => {
      const userAnswer = state.answers[question.id];
      const correctAnswer = question.correct_answer;

      totalScore += question.points;

      // Check if answer is correct
      let isCorrect = false;

      if (question.type === "multiple_choice") {
        isCorrect = String(userAnswer) === String(correctAnswer);
      } else if (question.type === "true_false") {
        isCorrect = Boolean(userAnswer) === Boolean(correctAnswer);
      } else if (question.type === "short_answer") {
        // Case-insensitive comparison for short answer
        isCorrect =
          String(userAnswer).toLowerCase().trim() ===
          String(correctAnswer).toLowerCase().trim();
      }

      if (isCorrect) {
        earnedPoints += question.points;
      }
    });

    const scorePercentage = (earnedPoints / totalScore) * 100;
    const passed = scorePercentage >= content.passing_score;

    setState((prev) => ({
      ...prev,
      isSubmitted: true,
      score: earnedPoints,
      passed,
    }));

    setIsCalculating(false);

    // Call completion callback
    if (onComplete) {
      onComplete(earnedPoints, totalScore, passed);
    }
  };

  const handleRetry = () => {
    setState({
      currentQuestionIndex: 0,
      answers: {},
      isSubmitted: false,
      score: 0,
      passed: false,
    });
  };

  // Difficulty badge color mapping
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
      case "medium":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "hard":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  // Bloom level badge color mapping
  const getBloomColor = (level: string) => {
    switch (level) {
      case "remember":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      case "understand":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
      case "apply":
        return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300";
      case "analyze":
        return "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  // Get translated difficulty label
  const getDifficultyLabel = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return t('viewer.difficulty.easy');
      case 'medium': return t('viewer.difficulty.medium');
      case 'hard': return t('viewer.difficulty.hard');
      default: return difficulty;
    }
  };

  // Get translated bloom level label
  const getBloomLabel = (level: string) => {
    switch (level) {
      case 'remember': return t('viewer.bloom.remember');
      case 'understand': return t('viewer.bloom.understand');
      case 'apply': return t('viewer.bloom.apply');
      case 'analyze': return t('viewer.bloom.analyze');
      default: return level;
    }
  };

  // Check if answer is correct (only for submitted state)
  const isAnswerCorrect = (question: QuizQuestion) => {
    if (!state.isSubmitted) return null;

    const userAnswer = state.answers[question.id];
    const correctAnswer = question.correct_answer;

    if (question.type === "multiple_choice") {
      return String(userAnswer) === String(correctAnswer);
    } else if (question.type === "true_false") {
      return Boolean(userAnswer) === Boolean(correctAnswer);
    } else if (question.type === "short_answer") {
      return (
        String(userAnswer).toLowerCase().trim() ===
        String(correctAnswer).toLowerCase().trim()
      );
    }

    return false;
  };

  // Results Summary View
  if (state.isSubmitted) {
    const scorePercentage = (state.score / content.metadata.total_points) * 100;

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="border-2">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              {state.passed ? (
                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <Trophy className="w-10 h-10 text-green-600 dark:text-green-400" />
                </div>
              ) : (
                <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                  <Target className="w-10 h-10 text-orange-600 dark:text-orange-400" />
                </div>
              )}
            </div>
            <CardTitle className="text-2xl">
              {state.passed ? t('viewer.quizPassed') : t('viewer.quizFailed')}
            </CardTitle>
            <CardDescription className="text-lg mt-2">
              {t('viewer.yourResult')}: {state.score} / {content.metadata.total_points} {t('viewer.points')} (
              {scorePercentage.toFixed(0)}%)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Score Progress Bar */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600 dark:text-gray-400">{t('viewer.progress')}</span>
                <span className="font-medium">{scorePercentage.toFixed(0)}%</span>
              </div>
              <Progress
                value={scorePercentage}
                className={
                  state.passed
                    ? "bg-green-100 dark:bg-green-900/30"
                    : "bg-orange-100 dark:bg-orange-900/30"
                }
                aria-label={t('viewer.quizResult')}
                aria-valuetext={`${scorePercentage.toFixed(0)}%`}
              />
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                {t('viewer.passingScore')}: {content.passing_score}%
              </p>
            </div>

            {/* Questions Review */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">{t('viewer.questionsReview')}</h3>
              {questions.map((question, index) => {
                const correct = isAnswerCorrect(question);
                return (
                  <div
                    key={question.id}
                    className="p-4 border rounded-lg dark:border-gray-700"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-medium text-sm mb-2">
                          {index + 1}. {question.question}
                        </p>
                      </div>
                      <div className="ml-4">
                        {correct ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                        ) : (
                          <X className="w-5 h-5 text-red-600 dark:text-red-400" />
                        )}
                      </div>
                    </div>

                    {/* User's Answer */}
                    <div className="text-sm space-y-2">
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">{t('viewer.yourAnswer')}: </span>
                        <span
                          className={
                            correct
                              ? "text-green-600 dark:text-green-400 font-medium"
                              : "text-red-600 dark:text-red-400 font-medium"
                          }
                        >
                          {question.type === "true_false"
                            ? state.answers[question.id]
                              ? t('viewer.true')
                              : t('viewer.false')
                            : question.type === "multiple_choice"
                            ? question.options?.find(
                                (opt) => opt.id === state.answers[question.id]
                              )?.text
                            : state.answers[question.id]}
                        </span>
                      </div>

                      {!correct && (
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">
                            {t('viewer.correctAnswer')}:{" "}
                          </span>
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            {question.type === "true_false"
                              ? question.correct_answer
                                ? t('viewer.true')
                                : t('viewer.false')
                              : question.type === "multiple_choice"
                              ? question.options?.find(
                                  (opt) => opt.id === question.correct_answer
                                )?.text
                              : String(question.correct_answer)}
                          </span>
                        </div>
                      )}

                      {/* Explanation */}
                      <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md">
                        <p className="text-blue-900 dark:text-blue-200 text-sm">
                          <strong>{t('viewer.explanation')}:</strong> {question.explanation}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex justify-center pt-4">
              <Button onClick={handleRetry} size="lg" className="gap-2" aria-label={t('viewer.retryQuiz')}>
                <RotateCcw className="w-4 h-4" />
                {t('viewer.tryAgain')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // Quiz Taking View
  return (
    <div className="relative space-y-6">
      {/* Loading overlay during score calculation */}
      {isCalculating && (
        <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 flex items-center justify-center z-10 rounded-lg">
          <div className="flex items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
            <span className="text-gray-600 dark:text-gray-300">{t('viewer.calculatingResults')}</span>
          </div>
        </div>
      )}

      {/* Quiz Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-2xl mb-2">{content.quiz_title}</CardTitle>
              <CardDescription className="text-base">
                {content.instructions}
              </CardDescription>
            </div>
            {content.time_limit_minutes && (
              <Badge variant="outline" className="gap-1.5 ml-4">
                <Clock className="w-3.5 h-3.5" />
                {t('viewer.minutesShort', { count: content.time_limit_minutes })}
              </Badge>
            )}
          </div>

          {/* Quiz Metadata */}
          <div className="flex flex-wrap gap-2 mt-4">
            <Badge variant="secondary">
              {t('viewer.questionsLabel', { count: totalQuestions })}
            </Badge>
            <Badge variant="secondary">
              {t('viewer.pointsLabel', { count: content.metadata.total_points })}
            </Badge>
            <Badge variant="secondary">
              {t('viewer.estimatedTime', { count: content.metadata.estimated_minutes })}
            </Badge>
            <Badge variant="outline">
              {t('viewer.passingScoreLabel', { score: content.passing_score })}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Progress Bar */}
      <div>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-600 dark:text-gray-400">
            {t('viewer.questionOf', { current: state.currentQuestionIndex + 1, total: totalQuestions })}
          </span>
          <span className="font-medium">{progressPercentage.toFixed(0)}%</span>
        </div>
        <Progress
          value={progressPercentage}
          aria-label={t('viewer.quizProgress')}
          aria-valuetext={t('viewer.questionOf', { current: state.currentQuestionIndex + 1, total: totalQuestions })}
        />
      </div>

      {/* Question Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestion.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="border-2">
            <CardHeader>
              <div className="flex flex-wrap gap-2 mb-3">
                <Badge className={getDifficultyColor(currentQuestion.difficulty)}>
                  {getDifficultyLabel(currentQuestion.difficulty)}
                </Badge>
                <Badge className={getBloomColor(currentQuestion.bloom_level)}>
                  {getBloomLabel(currentQuestion.bloom_level)}
                </Badge>
                <Badge variant="outline">{t('viewer.pointsEarned', { count: currentQuestion.points })}</Badge>
              </div>

              <CardTitle className="text-xl">{currentQuestion.question}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Multiple Choice */}
              {currentQuestion.type === "multiple_choice" && currentQuestion.options && (
                <RadioGroup
                  value={String(currentAnswer || "")}
                  onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
                  aria-label={currentQuestion.question}
                >
                  <div className="space-y-3">
                    {getShuffledOptions(currentQuestion).map((option) => (
                      <div
                        key={option.id}
                        className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                      >
                        <RadioGroupItem value={option.id} id={option.id} />
                        <Label
                          htmlFor={option.id}
                          className="flex-1 cursor-pointer text-base"
                        >
                          {option.text}
                        </Label>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              )}

              {/* True/False */}
              {currentQuestion.type === "true_false" && (
                <RadioGroup
                  value={
                    currentAnswer === undefined ? "" : currentAnswer ? "true" : "false"
                  }
                  onValueChange={(value) =>
                    handleAnswerChange(currentQuestion.id, value === "true")
                  }
                  aria-label={currentQuestion.question}
                >
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer">
                      <RadioGroupItem value="true" id="true" />
                      <Label htmlFor="true" className="flex-1 cursor-pointer text-base">
                        {t('viewer.true')}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer">
                      <RadioGroupItem value="false" id="false" />
                      <Label htmlFor="false" className="flex-1 cursor-pointer text-base">
                        {t('viewer.false')}
                      </Label>
                    </div>
                  </div>
                </RadioGroup>
              )}

              {/* Short Answer */}
              {currentQuestion.type === "short_answer" && (
                <div>
                  <Input
                    type="text"
                    placeholder={t('viewer.enterAnswer')}
                    value={String(currentAnswer || "")}
                    onChange={(e) =>
                      handleAnswerChange(currentQuestion.id, e.target.value)
                    }
                    className="text-base"
                    aria-label={currentQuestion.question}
                  />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    {t('viewer.shortAnswerHint')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          onClick={handlePrevious}
          disabled={isFirstQuestion}
          variant="outline"
          className="gap-2"
          aria-label={t('viewer.previousQuestion')}
        >
          <ChevronLeft className="w-4 h-4" />
          {t('viewer.back')}
        </Button>

        <div className="flex gap-2">
          {!isLastQuestion && (
            <Button
              onClick={handleNext}
              disabled={!isCurrentAnswered}
              className="gap-2"
              aria-label={t('viewer.nextQuestion')}
            >
              {t('viewer.next')}
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}

          {isLastQuestion && (
            <Button
              onClick={handleSubmit}
              disabled={!allAnswered}
              className="gap-2 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800"
              aria-label={t('viewer.submitQuiz')}
            >
              <Check className="w-4 h-4" />
              {t('viewer.finishQuiz')}
            </Button>
          )}
        </div>
      </div>

      {/* Answer Status */}
      <div className="text-center text-sm text-gray-500 dark:text-gray-400">
        {allAnswered ? (
          <span className="text-green-600 dark:text-green-400 font-medium">
            {t('viewer.allAnswered')}
          </span>
        ) : (
          <span>
            {t('viewer.answeredCount', { count: Object.keys(state.answers).length, total: totalQuestions })}
          </span>
        )}
      </div>
    </div>
  );
}
