import { z } from "zod";

export const formSchema = z.object({
  topic: z.string().min(3, "Тема должна содержать минимум 3 символа").max(200),
  email: z.string().email("Введите корректный email"),
  description: z.string().optional(),
  writingStyle: z.enum([
    "academic", "conversational", "storytelling", "practical", "motivational", 
    "visual", "gamified", "minimalist", "research", "engaging", "professional", 
    "socratic", "problem_based", "collaborative", "technical", "microlearning", 
    "inspirational", "interactive", "analytical"
  ]).optional(),
  language: z.enum([
    "ru", "en", "zh", "es", "fr", "de", "ja", "ko", "ar", "pt", "it",
    "tr", "vi", "th", "id", "ms", "hi", "pl"
  ]).optional(),
  targetAudience: z.string().optional(),
  estimatedLessons: z.number().min(10).max(100).optional().or(z.nan().transform(() => undefined)),
  estimatedSections: z.number().min(3).max(30).optional().or(z.nan().transform(() => undefined)),
  contentStrategy: z.enum([
    "auto", "create_from_scratch", "expand_and_enhance", "optimize_existing"
  ]).optional(),
  lessonDuration: z.number().int().min(3).max(45).optional(),
  learningOutcomes: z.string().optional(),
  formats: z.array(z.string()).optional()
});

export type FormData = z.infer<typeof formSchema>;
