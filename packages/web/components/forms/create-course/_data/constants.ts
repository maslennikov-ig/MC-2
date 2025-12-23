import {
  FileText,
  Video,
  Mic,
  FlaskConical,
  MousePointerClick,
  ClipboardList,
  Presentation,
  PenTool,
  ClipboardCheck,
} from "lucide-react";
import { GenerationFormat } from "../_types";

export const generationFormats: GenerationFormat[] = [
  { value: "text", icon: FileText, title: "Текст", description: "Основной текст уроков", available: true, required: true },
  { value: "video", icon: Video, title: "Видео", description: "Создание видео-урока", available: false },
  { value: "audio", icon: Mic, title: "Аудио", description: "Озвучка текста урока", available: false },
  { value: "tests", icon: FlaskConical, title: "Тесты", description: "Тесты для проверки знаний", available: false },
  { value: "interactive", icon: MousePointerClick, title: "Интерактив", description: "Интерактивные упражнения", available: false },
  { value: "quiz", icon: ClipboardList, title: "Квиз", description: "Тестовые вопросы по материалу", available: false },
  { value: "presentation", icon: Presentation, title: "Презентация", description: "Слайды для урока", available: false },
  { value: "exercises", icon: PenTool, title: "Задания", description: "Практические упражнения", available: false },
  { value: "summary", icon: ClipboardCheck, title: "Конспект", description: "Краткое изложение материала", available: false }
];
