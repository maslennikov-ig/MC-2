/**
 * Type definitions for Clarifying Questions feature
 */

export type QuestionPriority = 'critical' | 'important' | 'nice_to_have'

export type AnswerSource = 'suggested' | 'modified' | 'custom'

export interface SuggestedAnswer {
  /** Suggested answer text */
  text: string
  /** Optional rationale explaining why this answer is suggested */
  rationale?: string
}

export interface Question {
  /** Unique question identifier */
  id: string
  /** Question text displayed to user */
  text: string
  /** Priority level determining if answer is required */
  priority: QuestionPriority
  /** AI-generated suggested answers */
  suggestedAnswers: SuggestedAnswer[]
  /** User's current answer (if answered) */
  currentAnswer?: string
  /** Whether question has been answered or skipped */
  isAnswered: boolean
}

export interface QuestionProgress {
  /** Total number of questions */
  total: number
  /** Number of answered questions */
  answered: number
  /** Number of critical questions answered */
  criticalAnswered: number
  /** Total number of critical questions */
  criticalTotal: number
}

export interface ClarifyingNodeData {
  /** Current status of clarifying questions process */
  status: 'pending' | 'active' | 'completed'
  /** Total number of questions */
  questionsCount: number
  /** Number of questions answered */
  answeredCount: number
  /** Number of critical questions answered */
  criticalAnswered: number
  /** Total number of critical questions */
  criticalTotal: number
}

/**
 * API request/response types (for tRPC)
 */

export interface GetQuestionsRequest {
  courseId: string
}

export interface GetQuestionsResponse {
  questions: Question[]
}

export interface SubmitAnswerRequest {
  courseId: string
  questionId: string
  answer: string
  source?: AnswerSource
}

export interface SubmitAnswerResponse {
  success: boolean
  questionId: string
}

export interface SkipQuestionRequest {
  courseId: string
  questionId: string
}

export interface SkipQuestionResponse {
  success: boolean
  questionId: string
}

export interface ApproveAndProceedRequest {
  courseId: string
}

export interface ApproveAndProceedResponse {
  success: boolean
  nextStage: string
}

export interface GetProgressRequest {
  courseId: string
}

export type GetProgressResponse = QuestionProgress
