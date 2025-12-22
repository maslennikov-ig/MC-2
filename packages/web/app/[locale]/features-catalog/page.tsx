'use client';

import React, { useState, useRef } from 'react';
import { Link } from '@/src/i18n/navigation';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { 
  Sparkles, 
  Brain, 
  BarChart3, 
  Gamepad2, 
  Users, 
  Link2, 
  Smartphone, 
  Shield, 
  Rocket, 
  Factory, 
  TrendingUp,
  DollarSign,
  Star,
  MapPin,
  CheckCircle2,
  Zap,
  Globe,
  Lock,
  Award,
  Layers,
  Target,
  Bot,
  FileText,
  Video,
  Languages,
  TestTube,
  PersonStanding,
  LineChart,
  Trophy,
  MessageSquare,
  Calendar,
  Briefcase,
  GraduationCap,
  Heart,
  Leaf,
  ChevronDown,
  Menu,
  X,
  Clock,
  BookOpen,
  Play,
  Cpu
} from 'lucide-react';

interface Feature {
  id: string;
  title: string;
  benefit: string;
  icon: React.ReactNode;
  color: string;
  gradient: string;
  stats?: string;
}

interface Section {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  gradient: string;
  features: Feature[];
}

const sectionsData: Section[] = [
  {
    id: 'automation',
    title: 'Автоматизация контента и управления знаниями',
    subtitle: 'Превращайте документы в курсы за минуты, а не недели',
    icon: <Sparkles className="w-6 h-6" />,
    color: 'from-purple-500 to-pink-500',
    gradient: 'bg-gradient-to-br from-purple-500/10 to-pink-500/10',
    features: [
      {
        id: 'instant-generation',
        title: 'Мгновенная генерация курсов из документов',
        benefit: 'Превращение любых корпоративных документов (PDF, Word, Excel, PowerPoint) в полноценные обучающие курсы за 5 минут вместо 2-3 недель. Экономия сотен часов работы методистов на каждом курсе.',
        icon: <Zap className="w-5 h-5" />,
        color: 'text-purple-500',
        gradient: 'from-purple-400 to-purple-600',
        stats: '-95% времени'
      },
      {
        id: 'auto-update',
        title: 'Автоматическое обновление курсов',
        benefit: 'Гарантия актуальности всех учебных материалов. Когда обновляется регламент или процедура, курс обновляется автоматически. 0% риска обучения по устаревшим материалам.',
        icon: <FileText className="w-5 h-5" />,
        color: 'text-pink-500',
        gradient: 'from-pink-400 to-pink-600',
        stats: '0% устаревания'
      },
      {
        id: 'knowledge-extraction',
        title: 'Извлечение знаний из корпоративных коммуникаций',
        benefit: 'AI анализирует переписку, записи встреч, email и автоматически создает базу знаний. 40% корпоративного обучения происходит неформально - теперь оно будет зафиксировано.',
        icon: <MessageSquare className="w-5 h-5" />,
        color: 'text-purple-500',
        gradient: 'from-purple-400 to-purple-600',
        stats: '40% скрытых знаний'
      },
      {
        id: 'meeting-to-course',
        title: 'Генерация курсов из записей встреч и вебинаров',
        benefit: 'Автоматическое превращение записанных совещаний, тренингов и презентаций в структурированные курсы с ключевыми моментами и тестами.',
        icon: <Video className="w-5 h-5" />,
        color: 'text-pink-500',
        gradient: 'from-pink-400 to-pink-600'
      },
      {
        id: 'incident-learning',
        title: 'Создание курсов из инцидентов и support-тикетов',
        benefit: 'Автоматическая генерация обучающих материалов на основе реальных проблем и их решений. Предотвращение повторения ошибок.',
        icon: <Shield className="w-5 h-5" />,
        color: 'text-purple-500',
        gradient: 'from-purple-400 to-purple-600'
      },
      {
        id: 'multilang',
        title: 'Multi-language генерация из одного источника',
        benefit: 'Создание курса на 40+ языках из одного документа. Экономия на переводах и локализации для международных компаний.',
        icon: <Languages className="w-5 h-5" />,
        color: 'text-pink-500',
        gradient: 'from-pink-400 to-pink-600',
        stats: '40+ языков'
      },
      {
        id: 'multi-format',
        title: 'Автоматическое создание различных форматов контента',
        benefit: 'Из одного источника генерируются: текстовые уроки, видео с AI-аватаром, подкасты, инфографика, интерактивные симуляции.',
        icon: <Layers className="w-5 h-5" />,
        color: 'text-purple-500',
        gradient: 'from-purple-400 to-purple-600'
      },
      {
        id: 'ai-video',
        title: 'AI-генерация видеолекций с реалистичным преподавателем',
        benefit: 'Создание профессиональных видеокурсов с виртуальным лектором без студии и актеров. Экономия 60-80% на производстве видео.',
        icon: <Video className="w-5 h-5" />,
        color: 'text-pink-500',
        gradient: 'from-pink-400 to-pink-600',
        stats: '-80% затрат'
      },
      {
        id: 'test-generation',
        title: 'Автоматическая генерация тестов и экзаменов',
        benefit: 'AI создает проверочные задания разного уровня сложности на основе материала курса. Экономия 10+ часов на каждом курсе.',
        icon: <TestTube className="w-5 h-5" />,
        color: 'text-purple-500',
        gradient: 'from-purple-400 to-purple-600',
        stats: '-10 часов/курс'
      },
      {
        id: 'simulations',
        title: 'Создание интерактивных симуляций и кейсов',
        benefit: 'Автоматическая генерация бизнес-кейсов, ролевых игр и сценариев для отработки навыков в безопасной среде.',
        icon: <Cpu className="w-5 h-5" />,
        color: 'text-pink-500',
        gradient: 'from-pink-400 to-pink-600'
      }
    ]
  },
  {
    id: 'personalization',
    title: 'Персонализация и адаптивное обучение',
    subtitle: 'Уникальный путь обучения для каждого сотрудника',
    icon: <Brain className="w-6 h-6" />,
    color: 'from-blue-500 to-cyan-500',
    gradient: 'bg-gradient-to-br from-blue-500/10 to-cyan-500/10',
    features: [
      {
        id: 'ai-trajectory',
        title: 'AI-персонализация траектории для каждого сотрудника',
        benefit: 'Каждый получает уникальный путь обучения на основе его роли, уровня знаний и карьерных целей. Повышение эффективности обучения на 60%.',
        icon: <Target className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600',
        stats: '+60% эффективности'
      },
      {
        id: 'dynamic-complexity',
        title: 'Динамическая адаптация сложности контента',
        benefit: 'AI автоматически упрощает или усложняет материал в зависимости от успехов ученика. Оптимальный уровень вызова для максимального усвоения.',
        icon: <Layers className="w-5 h-5" />,
        color: 'text-cyan-500',
        gradient: 'from-cyan-400 to-cyan-600'
      },
      {
        id: 'ai-coach',
        title: 'Персональный AI-коуч 24/7',
        benefit: 'Каждый сотрудник получает виртуального наставника, который отвечает на вопросы, мотивирует и направляет. В 100 раз дешевле живого коуча при круглосуточной доступности.',
        icon: <Bot className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600',
        stats: '100x дешевле'
      },
      {
        id: 'learning-style',
        title: 'Адаптация под стиль обучения',
        benefit: 'Система определяет предпочтительный стиль (визуальный, аудиальный, кинестетический) и подстраивает подачу материала.',
        icon: <PersonStanding className="w-5 h-5" />,
        color: 'text-cyan-500',
        gradient: 'from-cyan-400 to-cyan-600'
      },
      {
        id: 'ai-psychologist',
        title: 'AI-психолог для преодоления барьеров',
        benefit: 'Виртуальный психолог помогает преодолеть страх неудачи, прокрастинацию и синдром самозванца. +45% завершаемость сложных программ.',
        icon: <Heart className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600',
        stats: '+45% завершаемость'
      },
      {
        id: 'recommendations',
        title: 'Рекомендательная система "Netflix для обучения"',
        benefit: 'AI рекомендует следующие курсы на основе интересов, целей и пробелов в знаниях. Непрерывное развитие без усилий.',
        icon: <Award className="w-5 h-5" />,
        color: 'text-cyan-500',
        gradient: 'from-cyan-400 to-cyan-600'
      },
      {
        id: 'smart-reminders',
        title: 'Персонализированные напоминания в оптимальное время',
        benefit: 'AI определяет лучшее время для обучения каждого сотрудника и отправляет напоминания. +45% возвращаемость к обучению.',
        icon: <Clock className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600',
        stats: '+45% возвращаемость'
      },
      {
        id: 'individual-pace',
        title: 'Индивидуальная скорость прохождения',
        benefit: 'Каждый учится в своем темпе - быстрые ученики не скучают, медленные не отстают.',
        icon: <TrendingUp className="w-5 h-5" />,
        color: 'text-cyan-500',
        gradient: 'from-cyan-400 to-cyan-600'
      }
    ]
  },
  {
    id: 'analytics',
    title: 'Аналитика и измерение эффективности',
    subtitle: 'Измеряйте влияние обучения на бизнес-результаты',
    icon: <BarChart3 className="w-6 h-6" />,
    color: 'from-green-500 to-emerald-500',
    gradient: 'bg-gradient-to-br from-green-500/10 to-emerald-500/10',
    features: [
      {
        id: 'roi-dashboard',
        title: 'Dashboard корреляции обучения с бизнес-KPI',
        benefit: 'Прямое доказательство влияния обучения на продажи, качество, NPS. Обоснование бюджета L&D с точными цифрами ROI.',
        icon: <LineChart className="w-5 h-5" />,
        color: 'text-green-500',
        gradient: 'from-green-400 to-green-600',
        stats: 'ROI в цифрах'
      },
      {
        id: 'skill-prediction',
        title: 'Прогнозирование устаревания навыков',
        benefit: 'AI предсказывает, какие навыки устареют через 6-18 месяцев. Проактивная переквалификация до потери продуктивности.',
        icon: <TrendingUp className="w-5 h-5" />,
        color: 'text-emerald-500',
        gradient: 'from-emerald-400 to-emerald-600',
        stats: '6-18 месяцев'
      },
      {
        id: 'gap-analysis',
        title: 'Анализ пробелов в компетенциях команды',
        benefit: 'Тепловая карта навыков показывает слабые места команды. Точечное обучение там, где это необходимо.',
        icon: <Target className="w-5 h-5" />,
        color: 'text-green-500',
        gradient: 'from-green-400 to-green-600'
      },
      {
        id: 'performance-prediction',
        title: 'Предиктивная аналитика производительности',
        benefit: 'Прогноз будущей производительности сотрудника на основе его обучения. Выявление high-performers на ранней стадии.',
        icon: <Rocket className="w-5 h-5" />,
        color: 'text-emerald-500',
        gradient: 'from-emerald-400 to-emerald-600'
      },
      {
        id: 'roi-calculator',
        title: 'ROI-калькулятор для каждой программы',
        benefit: 'Расчет экономического эффекта до запуска обучения. Data-driven решения об инвестициях в L&D.',
        icon: <DollarSign className="w-5 h-5" />,
        color: 'text-green-500',
        gradient: 'from-green-400 to-green-600'
      },
      {
        id: 'practice-monitoring',
        title: 'Мониторинг применения знаний на практике',
        benefit: 'Отслеживание, как полученные знания используются в работе. Доказательство эффективности обучения.',
        icon: <CheckCircle2 className="w-5 h-5" />,
        color: 'text-emerald-500',
        gradient: 'from-emerald-400 to-emerald-600'
      },
      {
        id: 'realtime-engagement',
        title: 'Аналитика вовлеченности в реальном времени',
        benefit: 'Мгновенное выявление проблемных моментов в курсах. Оптимизация контента на основе поведения пользователей.',
        icon: <BarChart3 className="w-5 h-5" />,
        color: 'text-green-500',
        gradient: 'from-green-400 to-green-600'
      },
      {
        id: 'benchmarking',
        title: 'Benchmarking с индустрией',
        benefit: 'Сравнение программ обучения с лучшими практиками отрасли. Понимание конкурентной позиции.',
        icon: <Trophy className="w-5 h-5" />,
        color: 'text-emerald-500',
        gradient: 'from-emerald-400 to-emerald-600'
      },
      {
        id: 'emotion-analytics',
        title: 'Аналитика эмоционального состояния',
        benefit: 'AI определяет эмоциональное состояние учащихся и адаптирует подход. Снижение стресса и выгорания.',
        icon: <Heart className="w-5 h-5" />,
        color: 'text-green-500',
        gradient: 'from-green-400 to-green-600'
      },
      {
        id: 'retention-prediction',
        title: 'Прогнозирование риска увольнения',
        benefit: 'Выявление сотрудников с риском ухода на основе их вовлеченности в обучение. Превентивные меры удержания.',
        icon: <Shield className="w-5 h-5" />,
        color: 'text-emerald-500',
        gradient: 'from-emerald-400 to-emerald-600'
      }
    ]
  },
  {
    id: 'gamification',
    title: 'Геймификация и вовлечение',
    subtitle: 'Превратите обучение в увлекательное приключение',
    icon: <Gamepad2 className="w-6 h-6" />,
    color: 'from-orange-500 to-red-500',
    gradient: 'bg-gradient-to-br from-orange-500/10 to-red-500/10',
    features: [
      {
        id: 'corporate-leagues',
        title: 'Корпоративные лиги и чемпионаты',
        benefit: 'Соревнования между отделами и филиалами повышают вовлеченность на 89%. Обучение становится увлекательным.',
        icon: <Trophy className="w-5 h-5" />,
        color: 'text-orange-500',
        gradient: 'from-orange-400 to-orange-600',
        stats: '+89% вовлеченности'
      },
      {
        id: 'achievements',
        title: 'Система достижений и бейджей',
        benefit: '150+ достижений разной редкости мотивируют продолжать обучение. Визуальное отображение прогресса и экспертизы.',
        icon: <Award className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600'
      },
      {
        id: 'daily-quests',
        title: 'Ежедневные квесты и задания',
        benefit: '3 ежедневных задания поддерживают привычку учиться. Формирование культуры непрерывного обучения.',
        icon: <Calendar className="w-5 h-5" />,
        color: 'text-orange-500',
        gradient: 'from-orange-400 to-orange-600'
      },
      {
        id: 'streak-system',
        title: 'Streak-система как в Duolingo',
        benefit: 'Серии последовательных дней обучения с наградами. 20% увеличение ежедневных активных пользователей.',
        icon: <Zap className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600',
        stats: '+20% DAU'
      },
      {
        id: 'battle-pass',
        title: 'Battle Pass для корпоративного обучения',
        benefit: 'Сезонные программы с эксклюзивными наградами. Превращение обучения в увлекательное путешествие.',
        icon: <Star className="w-5 h-5" />,
        color: 'text-orange-500',
        gradient: 'from-orange-400 to-orange-600'
      },
      {
        id: 'pvp-quizzes',
        title: 'PvP-викторины между сотрудниками',
        benefit: 'Дуэли знаний в реальном времени. Социальное обучение через дружеское соперничество.',
        icon: <Gamepad2 className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600'
      },
      {
        id: 'raids',
        title: 'Рейды на образовательных боссов',
        benefit: 'Командные задания, требующие совместной работы. Укрепление командного духа через обучение.',
        icon: <Users className="w-5 h-5" />,
        color: 'text-orange-500',
        gradient: 'from-orange-400 to-orange-600'
      },
      {
        id: 'virtual-currency',
        title: 'Виртуальная валюта и магазин наград',
        benefit: 'Заработанные баллы можно обменять на реальные призы. Материальная мотивация к обучению.',
        icon: <DollarSign className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600'
      },
      {
        id: 'clans',
        title: 'Кланы и гильдии учащихся',
        benefit: 'Объединение в группы по интересам для взаимной поддержки. Снижение отсева через социальные связи.',
        icon: <Shield className="w-5 h-5" />,
        color: 'text-orange-500',
        gradient: 'from-orange-400 to-orange-600'
      },
      {
        id: 'storytelling',
        title: 'Сторителлинг и нарративные квесты',
        benefit: 'Обучение через захватывающие истории и приключения. 135% более быстрое выполнение задач.',
        icon: <BookOpen className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600',
        stats: '+135% скорость'
      }
    ]
  },
  {
    id: 'social',
    title: 'Социальное обучение и коллаборация',
    subtitle: 'Учитесь вместе, растите быстрее',
    icon: <Users className="w-6 h-6" />,
    color: 'from-indigo-500 to-purple-500',
    gradient: 'bg-gradient-to-br from-indigo-500/10 to-purple-500/10',
    features: [
      {
        id: 'expert-marketplace',
        title: 'Внутренний marketplace экспертов',
        benefit: 'Биржа, где сотрудники могут найти и забронировать время эксперта. +55% эффективность решения сложных задач.',
        icon: <Briefcase className="w-5 h-5" />,
        color: 'text-indigo-500',
        gradient: 'from-indigo-400 to-indigo-600',
        stats: '+55% решений'
      },
      {
        id: 'peer-learning',
        title: 'Peer-to-peer обучение с наградами',
        benefit: 'Сотрудники получают баллы за обучение коллег. Трансформация неявных знаний в корпоративные активы.',
        icon: <Users className="w-5 h-5" />,
        color: 'text-purple-500',
        gradient: 'from-purple-400 to-purple-600'
      },
      {
        id: 'social-feed',
        title: 'Социальная лента обучения',
        benefit: 'Twitter-подобная лента с микро-инсайтами от коллег. 69% увеличение вовлеченности через социальный элемент.',
        icon: <MessageSquare className="w-5 h-5" />,
        color: 'text-indigo-500',
        gradient: 'from-indigo-400 to-indigo-600',
        stats: '+69% вовлеченности'
      },
      {
        id: 'ai-mentorship',
        title: 'Система менторства с AI-подбором',
        benefit: 'Автоматический подбор ментора на основе целей и совместимости. 70% completion rate с ментором vs 30% без.',
        icon: <PersonStanding className="w-5 h-5" />,
        color: 'text-purple-500',
        gradient: 'from-purple-400 to-purple-600',
        stats: '70% vs 30%'
      },
      {
        id: 'study-groups',
        title: 'Виртуальные study groups',
        benefit: 'Автоматическое формирование учебных групп по интересам. Взаимная поддержка и мотивация.',
        icon: <GraduationCap className="w-5 h-5" />,
        color: 'text-indigo-500',
        gradient: 'from-indigo-400 to-indigo-600'
      },
      {
        id: 'corporate-wiki',
        title: 'Корпоративная Wikipedia',
        benefit: 'Совместное создание базы знаний компании. Сохранение экспертизы уходящих сотрудников.',
        icon: <BookOpen className="w-5 h-5" />,
        color: 'text-purple-500',
        gradient: 'from-purple-400 to-purple-600'
      },
      {
        id: 'qa-forum',
        title: 'Q&A форум с AI-модерацией',
        benefit: 'Место для вопросов и ответов с автоматической категоризацией. Быстрое решение проблем.',
        icon: <MessageSquare className="w-5 h-5" />,
        color: 'text-indigo-500',
        gradient: 'from-indigo-400 to-indigo-600'
      },
      {
        id: 'peer-review',
        title: 'Peer review заданий',
        benefit: 'Взаимная проверка работ развивает критическое мышление. Снижение нагрузки на HR.',
        icon: <CheckCircle2 className="w-5 h-5" />,
        color: 'text-purple-500',
        gradient: 'from-purple-400 to-purple-600'
      },
      {
        id: 'best-practices',
        title: 'Обмен лучшими практиками',
        benefit: 'Платформа для sharing успешных кейсов между подразделениями. Масштабирование успеха.',
        icon: <Award className="w-5 h-5" />,
        color: 'text-indigo-500',
        gradient: 'from-indigo-400 to-indigo-600'
      },
      {
        id: 'coffee-chats',
        title: 'Виртуальные coffee chats',
        benefit: 'AI организует неформальные встречи для обмена знаниями. Укрепление горизонтальных связей.',
        icon: <Users className="w-5 h-5" />,
        color: 'text-purple-500',
        gradient: 'from-purple-400 to-purple-600'
      }
    ]
  },
  {
    id: 'mobile',
    title: 'Микрообучение и мобильность',
    subtitle: 'Учитесь где угодно, когда угодно',
    icon: <Smartphone className="w-6 h-6" />,
    color: 'from-violet-500 to-purple-500',
    gradient: 'bg-gradient-to-br from-violet-500/10 to-purple-500/10',
    features: [
      {
        id: 'micro-lessons',
        title: 'Система ежедневных 5-минутных уроков',
        benefit: 'Обучение вписывается в любой график. 60% сотрудников учатся ежедневно vs 10% при традиционном подходе.',
        icon: <Calendar className="w-5 h-5" />,
        color: 'text-violet-500',
        gradient: 'from-violet-400 to-violet-600',
        stats: '60% vs 10%'
      },
      {
        id: 'just-in-time',
        title: 'Микрообучение в момент необходимости',
        benefit: 'Контекстные подсказки появляются когда нужно решить задачу. Just-in-time learning повышает применение на 70%.',
        icon: <Zap className="w-5 h-5" />,
        color: 'text-purple-500',
        gradient: 'from-purple-400 to-purple-600',
        stats: '+70% применения'
      },
      {
        id: 'offline-mode',
        title: 'Offline-режим для мобильного приложения',
        benefit: 'Обучение без интернета для выездных сотрудников. 100% охват персонала.',
        icon: <Globe className="w-5 h-5" />,
        color: 'text-violet-500',
        gradient: 'from-violet-400 to-violet-600',
        stats: '100% охват'
      },
      {
        id: 'push-notifications',
        title: 'Push-уведомления с мини-уроками',
        benefit: 'Обучение приходит к сотруднику, а не наоборот. +45% вовлеченности.',
        icon: <Smartphone className="w-5 h-5" />,
        color: 'text-purple-500',
        gradient: 'from-purple-400 to-purple-600',
        stats: '+45% вовлеченности'
      },
      {
        id: 'voice-learning',
        title: 'Голосовое обучение для водителей',
        benefit: 'Аудиокурсы для тех, кто в дороге. Продуктивное использование времени в пути.',
        icon: <Play className="w-5 h-5" />,
        color: 'text-violet-500',
        gradient: 'from-violet-400 to-violet-600'
      },
      {
        id: 'micro-tests',
        title: 'Микро-тесты в перерывах',
        benefit: '2-3 вопроса за кофе-брейк. Закрепление знаний без отрыва от работы.',
        icon: <TestTube className="w-5 h-5" />,
        color: 'text-purple-500',
        gradient: 'from-purple-400 to-purple-600'
      },
      {
        id: 'flashcards',
        title: 'Flashcards для запоминания',
        benefit: 'Карточки с ключевыми концепциями для быстрого повторения. +40% retention.',
        icon: <Layers className="w-5 h-5" />,
        color: 'text-violet-500',
        gradient: 'from-violet-400 to-violet-600',
        stats: '+40% retention'
      },
      {
        id: 'daily-digest',
        title: 'Daily learning digest',
        benefit: 'Персонализированная подборка на 10 минут каждое утро. Формирование привычки.',
        icon: <BookOpen className="w-5 h-5" />,
        color: 'text-purple-500',
        gradient: 'from-purple-400 to-purple-600'
      },
      {
        id: 'lunch-learn',
        title: 'Lunch & Learn сессии',
        benefit: 'Организация обучения во время обеда. Эффективное использование времени.',
        icon: <Clock className="w-5 h-5" />,
        color: 'text-violet-500',
        gradient: 'from-violet-400 to-violet-600'
      },
      {
        id: 'micro-certifications',
        title: 'Микро-сертификации',
        benefit: 'Получение мини-сертификатов за короткие модули. Постоянное чувство прогресса.',
        icon: <Award className="w-5 h-5" />,
        color: 'text-purple-500',
        gradient: 'from-purple-400 to-purple-600'
      }
    ]
  },
  {
    id: 'compliance',
    title: 'Compliance и сертификация',
    subtitle: 'Защита от штрафов и регуляторных рисков',
    icon: <Shield className="w-6 h-6" />,
    color: 'from-red-500 to-pink-500',
    gradient: 'bg-gradient-to-br from-red-500/10 to-pink-500/10',
    features: [
      {
        id: 'auto-compliance',
        title: 'Автоматизация обязательного обучения',
        benefit: '100% прохождение compliance-тренингов без напоминаний HR. Избежание многомиллионных штрафов от регуляторов.',
        icon: <Shield className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600',
        stats: '0 штрафов'
      },
      {
        id: 'blockchain-certs',
        title: 'Блокчейн-сертификаты',
        benefit: 'Неподделываемые цифровые дипломы. -90% затрат на верификацию квалификаций.',
        icon: <Award className="w-5 h-5" />,
        color: 'text-pink-500',
        gradient: 'from-pink-400 to-pink-600',
        stats: '-90% верификации'
      },
      {
        id: 'cert-tracking',
        title: 'Автоматическое отслеживание сроков сертификатов',
        benefit: 'Система сама напоминает о необходимости пересертификации. 0% просроченных лицензий.',
        icon: <Calendar className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600',
        stats: '0% просрочек'
      },
      {
        id: 'audit-trail',
        title: 'Audit trail на 7+ лет',
        benefit: 'Полная история обучения для регуляторов. Защита от проверок и штрафов.',
        icon: <FileText className="w-5 h-5" />,
        color: 'text-pink-500',
        gradient: 'from-pink-400 to-pink-600'
      },
      {
        id: 'compliance-templates',
        title: 'Отраслевые compliance-шаблоны',
        benefit: 'Готовые курсы для GDPR, HIPAA, SOX, AML. Быстрый запуск без разработки.',
        icon: <Briefcase className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600'
      },
      {
        id: 'e-signatures',
        title: 'Электронные подписи на документах',
        benefit: 'Юридически значимое подтверждение прохождения. Защита от споров.',
        icon: <Lock className="w-5 h-5" />,
        color: 'text-pink-500',
        gradient: 'from-pink-400 to-pink-600'
      },
      {
        id: 'multi-jurisdiction',
        title: 'Multi-jurisdiction поддержка',
        benefit: 'Учет требований разных юрисдикций для международных компаний. Один курс - все страны.',
        icon: <Globe className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600'
      },
      {
        id: 'auto-reports',
        title: 'Автоматическая генерация отчетов',
        benefit: 'Готовые отчеты для регуляторов одним кликом. Экономия недель работы.',
        icon: <BarChart3 className="w-5 h-5" />,
        color: 'text-pink-500',
        gradient: 'from-pink-400 to-pink-600'
      },
      {
        id: 'version-control',
        title: 'Version control для курсов',
        benefit: 'История всех изменений с возможностью отката. Доказательство соответствия на любую дату.',
        icon: <Clock className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600'
      },
      {
        id: 'grc-integration',
        title: 'Интеграция с GRC-системами',
        benefit: 'Синхронизация с системами управления рисками. Целостная картина compliance.',
        icon: <Link2 className="w-5 h-5" />,
        color: 'text-pink-500',
        gradient: 'from-pink-400 to-pink-600'
      }
    ]
  },
  {
    id: 'innovation-tech',
    title: 'Инновационные технологии',
    subtitle: 'Технологии будущего уже сегодня',
    icon: <Rocket className="w-6 h-6" />,
    color: 'from-cyan-500 to-blue-500',
    gradient: 'bg-gradient-to-br from-cyan-500/10 to-blue-500/10',
    features: [
      {
        id: 'vr-training',
        title: 'VR-тренажеры для опасных операций',
        benefit: 'Отработка критических навыков без риска. -75% производственных травм.',
        icon: <Rocket className="w-5 h-5" />,
        color: 'text-cyan-500',
        gradient: 'from-cyan-400 to-cyan-600',
        stats: '-75% травм'
      },
      {
        id: 'ar-instructions',
        title: 'AR-инструкции на рабочем месте',
        benefit: 'Наложение подсказок на реальное оборудование через смартфон. -50% ошибок при сложных операциях.',
        icon: <Layers className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600',
        stats: '-50% ошибок'
      },
      {
        id: 'ai-expert-clones',
        title: 'AI-клоны лучших экспертов',
        benefit: 'Цифровые двойники топ-специалистов для обучения. Сохранение уникальной экспертизы навсегда.',
        icon: <Bot className="w-5 h-5" />,
        color: 'text-cyan-500',
        gradient: 'from-cyan-400 to-cyan-600'
      },
      {
        id: 'neuro-interfaces',
        title: 'Нейроинтерфейсы для ускоренного обучения',
        benefit: 'Прямая загрузка знаний в мозг (пилотный проект). Обучение за минуты вместо месяцев.',
        icon: <Cpu className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600'
      },
      {
        id: 'holographic-lectures',
        title: 'Голографические лекции',
        benefit: '3D-преподаватель в дополненной реальности. Эффект присутствия без поездок.',
        icon: <Star className="w-5 h-5" />,
        color: 'text-cyan-500',
        gradient: 'from-cyan-400 to-cyan-600'
      },
      {
        id: 'digital-twins',
        title: 'AI-генерация цифровых двойников процессов',
        benefit: 'Виртуальные копии реальных бизнес-процессов для обучения. Эксперименты без последствий.',
        icon: <Layers className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600'
      },
      {
        id: 'quantum-simulations',
        title: 'Квантовые симуляции для финансовых моделей',
        benefit: 'Обучение на сверхсложных сценариях. Подготовка к черным лебедям.',
        icon: <TrendingUp className="w-5 h-5" />,
        color: 'text-cyan-500',
        gradient: 'from-cyan-400 to-cyan-600'
      },
      {
        id: 'biometric-adaptation',
        title: 'Биометрическая адаптация контента',
        benefit: 'Изменение подачи на основе пульса и eye-tracking. Оптимальная когнитивная нагрузка.',
        icon: <Heart className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600'
      },
      {
        id: 'metaverse-learning',
        title: 'Метавселенная для обучения',
        benefit: 'Виртуальный кампус для удаленных команд. Социальное присутствие без офиса.',
        icon: <Globe className="w-5 h-5" />,
        color: 'text-cyan-500',
        gradient: 'from-cyan-400 to-cyan-600'
      },
      {
        id: 'ai-prediction',
        title: 'AI-предсказание learning outcomes',
        benefit: 'Прогноз результатов обучения до его начала. Оптимизация инвестиций в L&D.',
        icon: <Brain className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600'
      }
    ]
  },
  {
    id: 'industry-solutions',
    title: 'Отраслевые решения',
    subtitle: 'Специализированные решения для вашей индустрии',
    icon: <Factory className="w-6 h-6" />,
    color: 'from-amber-500 to-orange-500',
    gradient: 'bg-gradient-to-br from-amber-500/10 to-orange-500/10',
    features: [
      {
        id: 'osha-manufacturing',
        title: 'OSHA-автоматизация для производства',
        benefit: 'Автоматическое соответствие требованиям безопасности. -60% несчастных случаев.',
        icon: <Shield className="w-5 h-5" />,
        color: 'text-amber-500',
        gradient: 'from-amber-400 to-amber-600',
        stats: '-60% несчастных случаев'
      },
      {
        id: 'finra-compliance',
        title: 'FINRA-compliant обучение для финансов',
        benefit: 'Встроенное соответствие финансовым регуляторам. 0 штрафов за нарушения.',
        icon: <DollarSign className="w-5 h-5" />,
        color: 'text-orange-500',
        gradient: 'from-orange-400 to-orange-600',
        stats: '0 штрафов'
      },
      {
        id: 'hipaa-healthcare',
        title: 'HIPAA-training для здравоохранения',
        benefit: 'Защита данных пациентов через правильное обучение. Избежание многомиллионных штрафов.',
        icon: <Heart className="w-5 h-5" />,
        color: 'text-amber-500',
        gradient: 'from-amber-400 to-amber-600'
      },
      {
        id: 'gmp-pharma',
        title: 'GMP-обучение для фармацевтики',
        benefit: 'Соответствие стандартам качества производства. Защита репутации и лицензий.',
        icon: <TestTube className="w-5 h-5" />,
        color: 'text-orange-500',
        gradient: 'from-orange-400 to-orange-600'
      },
      {
        id: 'cybersecurity-it',
        title: 'Кибербезопасность для IT',
        benefit: 'Симуляции кибератак для обучения. -70% успешных фишинг-атак.',
        icon: <Lock className="w-5 h-5" />,
        color: 'text-amber-500',
        gradient: 'from-amber-400 to-amber-600',
        stats: '-70% фишинга'
      },
      {
        id: 'customer-service-retail',
        title: 'Customer service для ритейла',
        benefit: 'Ролевые игры с виртуальными покупателями. +15-20% конверсии продаж.',
        icon: <Users className="w-5 h-5" />,
        color: 'text-orange-500',
        gradient: 'from-orange-400 to-orange-600',
        stats: '+20% конверсии'
      },
      {
        id: 'flight-safety',
        title: 'Безопасность полетов для авиации',
        benefit: 'VR-симуляторы аварийных ситуаций. Подготовка без риска.',
        icon: <Rocket className="w-5 h-5" />,
        color: 'text-amber-500',
        gradient: 'from-amber-400 to-amber-600'
      },
      {
        id: 'gov-compliance',
        title: 'Комплаенс для госсектора',
        benefit: 'Соответствие государственным стандартам. Прохождение проверок.',
        icon: <Shield className="w-5 h-5" />,
        color: 'text-orange-500',
        gradient: 'from-orange-400 to-orange-600'
      },
      {
        id: 'food-safety',
        title: 'Food safety для HoReCa',
        benefit: 'Обучение санитарным нормам. Защита от закрытия.',
        icon: <Award className="w-5 h-5" />,
        color: 'text-amber-500',
        gradient: 'from-amber-400 to-amber-600'
      },
      {
        id: 'esg-training',
        title: 'ESG-обучение для всех отраслей',
        benefit: 'Соответствие стандартам устойчивого развития. Доступ к ESG-финансированию.',
        icon: <Leaf className="w-5 h-5" />,
        color: 'text-orange-500',
        gradient: 'from-orange-400 to-orange-600'
      }
    ]
  },
  {
    id: 'future-skills',
    title: 'Развитие навыков будущего',
    subtitle: 'Готовьте команду к вызовам завтрашнего дня',
    icon: <GraduationCap className="w-6 h-6" />,
    color: 'from-emerald-500 to-teal-500',
    gradient: 'bg-gradient-to-br from-emerald-500/10 to-teal-500/10',
    features: [
      {
        id: 'ai-literacy',
        title: 'AI literacy для всех сотрудников',
        benefit: 'Подготовка к работе с AI-инструментами. Сохранение конкурентоспособности.',
        icon: <Brain className="w-5 h-5" />,
        color: 'text-emerald-500',
        gradient: 'from-emerald-400 to-emerald-600'
      },
      {
        id: 'critical-thinking',
        title: 'Критическое мышление и problem-solving',
        benefit: 'Развитие навыков, которые не заменит AI. Повышение ценности человеческого капитала.',
        icon: <Target className="w-5 h-5" />,
        color: 'text-teal-500',
        gradient: 'from-teal-400 to-teal-600'
      },
      {
        id: 'emotional-intelligence',
        title: 'Эмоциональный интеллект',
        benefit: 'Измеримое развитие soft skills. Улучшение командной работы.',
        icon: <Heart className="w-5 h-5" />,
        color: 'text-emerald-500',
        gradient: 'from-emerald-400 to-emerald-600'
      },
      {
        id: 'digital-mindset',
        title: 'Цифровая трансформация mindset',
        benefit: 'Подготовка к изменениям. Снижение сопротивления инновациям.',
        icon: <Cpu className="w-5 h-5" />,
        color: 'text-teal-500',
        gradient: 'from-teal-400 to-teal-600'
      },
      {
        id: 'data-literacy',
        title: 'Data literacy',
        benefit: 'Понимание данных всеми сотрудниками. Data-driven культура.',
        icon: <BarChart3 className="w-5 h-5" />,
        color: 'text-emerald-500',
        gradient: 'from-emerald-400 to-emerald-600'
      },
      {
        id: 'creativity-innovation',
        title: 'Креативность и инновации',
        benefit: 'Структурированное развитие творческого мышления. Больше инноваций.',
        icon: <Sparkles className="w-5 h-5" />,
        color: 'text-teal-500',
        gradient: 'from-teal-400 to-teal-600'
      },
      {
        id: 'agile-methodologies',
        title: 'Agile и гибкие методологии',
        benefit: 'Адаптивность к изменениям. Быстрая реакция на рынок.',
        icon: <Zap className="w-5 h-5" />,
        color: 'text-emerald-500',
        gradient: 'from-emerald-400 to-emerald-600'
      },
      {
        id: 'intercultural-communication',
        title: 'Межкультурная коммуникация',
        benefit: 'Эффективная работа в глобальных командах. Меньше конфликтов.',
        icon: <Globe className="w-5 h-5" />,
        color: 'text-teal-500',
        gradient: 'from-teal-400 to-teal-600'
      },
      {
        id: 'resilience-wellbeing',
        title: 'Устойчивость и well-being',
        benefit: 'Предотвращение выгорания. Сохранение продуктивности.',
        icon: <Shield className="w-5 h-5" />,
        color: 'text-emerald-500',
        gradient: 'from-emerald-400 to-emerald-600'
      },
      {
        id: 'entrepreneurial-mindset',
        title: 'Предпринимательское мышление',
        benefit: 'Intrapreneurship для инноваций внутри компании. Новые бизнес-возможности.',
        icon: <Rocket className="w-5 h-5" />,
        color: 'text-teal-500',
        gradient: 'from-teal-400 to-teal-600'
      }
    ]
  },
  {
    id: 'economy',
    title: 'Экономия и оптимизация затрат',
    subtitle: 'Снижайте затраты, повышайте эффективность',
    icon: <DollarSign className="w-6 h-6" />,
    color: 'from-green-500 to-teal-500',
    gradient: 'bg-gradient-to-br from-green-500/10 to-teal-500/10',
    features: [
      {
        id: 'cost-reduction-99',
        title: 'Снижение стоимости создания курса на 99%',
        benefit: 'Стоимость создания курса сопоставима с чашкой кофе. Возможность обучать всех сотрудников, а не только избранных.',
        icon: <DollarSign className="w-5 h-5" />,
        color: 'text-green-500',
        gradient: 'from-green-400 to-green-600',
        stats: '-99% затрат'
      },
      {
        id: 'onboarding-time',
        title: 'Сокращение времени адаптации на 43%',
        benefit: 'Новые сотрудники выходят на продуктивность за 45 дней вместо 90. Существенная экономия на каждом новом сотруднике.',
        icon: <Clock className="w-5 h-5" />,
        color: 'text-teal-500',
        gradient: 'from-teal-400 to-teal-600',
        stats: '-43% времени'
      },
      {
        id: 'retention-improvement',
        title: 'Снижение текучести на 27%',
        benefit: 'Сотрудники остаются, когда компания инвестирует в их развитие. Огромная экономия на поиске и обучении замены.',
        icon: <Heart className="w-5 h-5" />,
        color: 'text-green-500',
        gradient: 'from-green-400 to-green-600',
        stats: '-27% текучести'
      },
      {
        id: 'ld-automation',
        title: 'Автоматизация работы L&D на 70%',
        benefit: 'L&D-команда фокусируется на стратегии, а не на рутине. Больше impact с меньшими ресурсами.',
        icon: <Cpu className="w-5 h-5" />,
        color: 'text-teal-500',
        gradient: 'from-teal-400 to-teal-600',
        stats: '-70% рутины'
      },
      {
        id: 'centralization',
        title: 'Централизация обучения в одной платформе',
        benefit: 'Отказ от множества разрозненных систем. Экономия на лицензиях и интеграциях.',
        icon: <Layers className="w-5 h-5" />,
        color: 'text-green-500',
        gradient: 'from-green-400 to-green-600'
      },
      {
        id: 'pay-per-use',
        title: 'Pay-per-use модель оплаты',
        benefit: 'Платите только за активных пользователей. Нет переплаты за неиспользуемые места.',
        icon: <DollarSign className="w-5 h-5" />,
        color: 'text-teal-500',
        gradient: 'from-teal-400 to-teal-600'
      },
      {
        id: 'external-trainers',
        title: 'Отказ от внешних тренеров',
        benefit: 'Внутренняя экспертиза заменяет дорогих консультантов. Экономия миллионов рублей в год на внешнем обучении.',
        icon: <Users className="w-5 h-5" />,
        color: 'text-green-500',
        gradient: 'from-green-400 to-green-600'
      },
      {
        id: 'travel-reduction',
        title: 'Снижение travel-расходов на обучение',
        benefit: 'Виртуальное обучение вместо командировок. -80% расходов на поездки.',
        icon: <Globe className="w-5 h-5" />,
        color: 'text-teal-500',
        gradient: 'from-teal-400 to-teal-600',
        stats: '-80% поездок'
      },
      {
        id: 'scaling',
        title: 'Масштабирование без роста затрат',
        benefit: 'Обучение 10,000 стоит как обучение 100. Экономия на масштабе.',
        icon: <TrendingUp className="w-5 h-5" />,
        color: 'text-green-500',
        gradient: 'from-green-400 to-green-600'
      },
      {
        id: 'error-prevention',
        title: 'Предотвращение ошибок через обучение',
        benefit: 'Качественное обучение снижает costly mistakes. ROI через избежание потерь.',
        icon: <Shield className="w-5 h-5" />,
        color: 'text-teal-500',
        gradient: 'from-teal-400 to-teal-600'
      }
    ]
  },
  {
    id: 'unique-differentiators',
    title: 'Уникальные дифференциаторы',
    subtitle: 'То, что отличает нас от всех остальных',
    icon: <Star className="w-6 h-6" />,
    color: 'from-yellow-500 to-amber-500',
    gradient: 'bg-gradient-to-br from-yellow-500/10 to-amber-500/10',
    features: [
      {
        id: 'workflow-engine',
        title: 'Workflow automation engine',
        benefit: 'Бесконечная кастомизация процессов генерации. Адаптация под любые требования.',
        icon: <Cpu className="w-5 h-5" />,
        color: 'text-yellow-500',
        gradient: 'from-yellow-400 to-yellow-600'
      },
      {
        id: 'multi-ai',
        title: 'Multi-AI model подход',
        benefit: 'Лучшая модель для каждой задачи. Не зависите от одного провайдера.',
        icon: <Brain className="w-5 h-5" />,
        color: 'text-amber-500',
        gradient: 'from-amber-400 to-amber-600'
      },
      {
        id: 'open-source',
        title: 'Open-source компоненты',
        benefit: 'Прозрачность и возможность аудита кода. Доверие IT-департаментов.',
        icon: <Globe className="w-5 h-5" />,
        color: 'text-yellow-500',
        gradient: 'from-yellow-400 to-yellow-600'
      },
      {
        id: 'self-hosted',
        title: 'Self-hosted опция',
        benefit: 'Полный контроль над данными. Решение для регулируемых индустрий.',
        icon: <Lock className="w-5 h-5" />,
        color: 'text-amber-500',
        gradient: 'from-amber-400 to-amber-600'
      },
      {
        id: 'white-label',
        title: 'White-label возможности',
        benefit: 'Платформа под вашим брендом. Усиление корпоративной культуры.',
        icon: <Award className="w-5 h-5" />,
        color: 'text-yellow-500',
        gradient: 'from-yellow-400 to-yellow-600'
      },
      {
        id: 'no-code',
        title: 'No-code интерфейс для HR',
        benefit: 'HR создает курсы без помощи IT. Демократизация создания контента.',
        icon: <Users className="w-5 h-5" />,
        color: 'text-amber-500',
        gradient: 'from-amber-400 to-amber-600'
      },
      {
        id: 'instant-roi',
        title: 'Instant ROI видимость',
        benefit: 'Видите отдачу от каждого курса в реальном времени. Прозрачность инвестиций.',
        icon: <LineChart className="w-5 h-5" />,
        color: 'text-yellow-500',
        gradient: 'from-yellow-400 to-yellow-600'
      },
      {
        id: 'ai-ethics',
        title: 'AI ethics встроенная',
        benefit: 'Ответственное использование AI. Соответствие корпоративным ценностям.',
        icon: <Shield className="w-5 h-5" />,
        color: 'text-amber-500',
        gradient: 'from-amber-400 to-amber-600'
      },
      {
        id: 'quantum-ready',
        title: 'Quantum-ready архитектура',
        benefit: 'Готовность к квантовым вычислениям. Future-proof инвестиции.',
        icon: <Rocket className="w-5 h-5" />,
        color: 'text-yellow-500',
        gradient: 'from-yellow-400 to-yellow-600'
      },
      {
        id: 'carbon-neutral',
        title: 'Carbon-neutral обучение',
        benefit: 'Экологичная альтернатива очному обучению. ESG-цели компании.',
        icon: <Leaf className="w-5 h-5" />,
        color: 'text-amber-500',
        gradient: 'from-amber-400 to-amber-600'
      }
    ]
  },
  {
    id: 'russia-specific',
    title: 'Специфика для российского рынка',
    subtitle: 'Полная адаптация под российские реалии',
    icon: <MapPin className="w-6 h-6" />,
    color: 'from-red-500 to-blue-500',
    gradient: 'bg-gradient-to-br from-red-500/10 to-blue-500/10',
    features: [
      {
        id: 'russian-edo',
        title: 'Интеграция с российскими КЭДО системами',
        benefit: 'Бесшовная работа с Диадок, СБИС, Контур.Диадок. Автоматический импорт регламентов и инструкций.',
        icon: <Link2 className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600'
      },
      {
        id: '1c-support',
        title: 'Поддержка 1С и российских ERP',
        benefit: 'Нативная интеграция с 1С:Предприятие, 1С:ЗУП, Галактика ERP. Синхронизация данных о сотрудниках.',
        icon: <Briefcase className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600'
      },
      {
        id: 'fz-152',
        title: 'Соответствие ФЗ-152 "О персональных данных"',
        benefit: 'Полное соответствие российскому законодательству. Хранение данных на территории РФ.',
        icon: <Shield className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600'
      },
      {
        id: 'esia-integration',
        title: 'Интеграция с ЕСИА (Госуслуги)',
        benefit: 'Авторизация через Госуслуги для госкомпаний. Упрощенный доступ для сотрудников.',
        icon: <Lock className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600'
      },
      {
        id: 'russian-standards',
        title: 'Готовые курсы по российским стандартам',
        benefit: 'Библиотека курсов по охране труда, пожарной безопасности, ГО и ЧС согласно российским требованиям.',
        icon: <BookOpen className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600'
      },
      {
        id: 'russian-sed',
        title: 'Поддержка СЭД (Системы электронного документооборота)',
        benefit: 'Интеграция с Directum, Docsvision, ТЕЗИС. Автоматическое обучение при изменении процессов.',
        icon: <FileText className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600'
      },
      {
        id: 'sanction-free-ai',
        title: 'Русскоязычный AI без санкционных рисков',
        benefit: 'Использование российских и китайских AI-моделей. Независимость от западных технологий.',
        icon: <Bot className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600'
      },
      {
        id: 'russian-messengers',
        title: 'Интеграция с российскими мессенджерами',
        benefit: 'Встраивание в корпоративные версии Telegram, VK Teams. Обучение там, где общаются сотрудники.',
        icon: <MessageSquare className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600'
      },
      {
        id: 'national-languages',
        title: 'Поддержка национальных языков РФ',
        benefit: 'Генерация курсов на татарском, башкирском, чеченском и других языках народов России.',
        icon: <Languages className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600'
      },
      {
        id: 'prof-standards',
        title: 'Сертификация по профстандартам',
        benefit: 'Подготовка к независимой оценке квалификации. Соответствие требованиям Минтруда.',
        icon: <Award className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600'
      },
      {
        id: 'trudvsem-integration',
        title: 'Интеграция с порталом "Работа России"',
        benefit: 'Автоматическая публикация данных об обучении. Повышение привлекательности работодателя.',
        icon: <Briefcase className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600'
      },
      {
        id: 'russian-payments',
        title: 'Поддержка российских платежных систем',
        benefit: 'Оплата через СБП, МИР, ЮMoney. Удобство для российских компаний.',
        icon: <DollarSign className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600'
      },
      {
        id: 'import-substitution',
        title: 'Готовые курсы для импортозамещения',
        benefit: 'Обучение переходу на российское ПО. Снижение зависимости от иностранных решений.',
        icon: <Layers className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600'
      },
      {
        id: 'russian-office',
        title: 'Интеграция с "Мой офис" и Р7-Офис',
        benefit: 'Работа с российскими офисными пакетами. Полная совместимость с корпоративным ПО.',
        icon: <FileText className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600'
      },
      {
        id: 'gost-crypto',
        title: 'Поддержка ЭЦП и российской криптографии',
        benefit: 'Использование ГОСТ-алгоритмов и квалифицированной ЭП. Юридическая значимость сертификатов.',
        icon: <Lock className="w-5 h-5" />,
        color: 'text-red-500',
        gradient: 'from-red-400 to-red-600'
      }
    ]
  },
  {
    id: 'integration',
    title: 'Интеграция с корпоративными системами',
    subtitle: 'Бесшовная интеграция с вашей IT-экосистемой',
    icon: <Link2 className="w-6 h-6" />,
    color: 'from-teal-500 to-blue-500',
    gradient: 'bg-gradient-to-br from-teal-500/10 to-blue-500/10',
    features: [
      {
        id: 'hris-sync',
        title: 'Двусторонняя синхронизация с HRIS',
        benefit: 'Автоматическое обновление данных между системами. -70% административной работы, 0 ошибок в данных.',
        icon: <Link2 className="w-5 h-5" />,
        color: 'text-teal-500',
        gradient: 'from-teal-400 to-teal-600',
        stats: '-70% админработы'
      },
      {
        id: 'performance-integration',
        title: 'Интеграция с Performance Management',
        benefit: 'Автоматическое создание learning goals из performance reviews. Прямая связь обучения с карьерным ростом.',
        icon: <TrendingUp className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600'
      },
      {
        id: 'chat-integration',
        title: 'Встраивание в рабочие чаты',
        benefit: 'Обучение прямо в рабочем чате. 70% лучше применение знаний благодаря контекстной подаче.',
        icon: <MessageSquare className="w-5 h-5" />,
        color: 'text-teal-500',
        gradient: 'from-teal-400 to-teal-600',
        stats: '+70% применения'
      },
      {
        id: 'calendar-sync',
        title: 'Синхронизация с календарем',
        benefit: 'Автоматическое планирование обучения в свободные слоты. +15% регулярности занятий.',
        icon: <Calendar className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600',
        stats: '+15% регулярности'
      },
      {
        id: 'crm-integration',
        title: 'Интеграция с CRM',
        benefit: 'Обучение продажам на основе реальных данных о клиентах. Персонализированные сценарии.',
        icon: <Briefcase className="w-5 h-5" />,
        color: 'text-teal-500',
        gradient: 'from-teal-400 to-teal-600'
      },
      {
        id: 'bi-integration',
        title: 'Подключение к BI-системам',
        benefit: 'Отображение метрик обучения в корпоративных дашбордах. Видимость для C-level.',
        icon: <BarChart3 className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600'
      },
      {
        id: 'sso',
        title: 'SSO и Active Directory',
        benefit: 'Единый вход без дополнительных паролей. Централизованное управление доступом.',
        icon: <Lock className="w-5 h-5" />,
        color: 'text-teal-500',
        gradient: 'from-teal-400 to-teal-600'
      },
      {
        id: 'api',
        title: 'API для custom интеграций',
        benefit: 'Возможность подключить любые корпоративные системы. Полная гибкость.',
        icon: <Globe className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600'
      },
      {
        id: 'document-integration',
        title: 'Интеграция с системами документооборота',
        benefit: 'Автоматическое создание курсов из новых регламентов. Мгновенное обучение изменениям.',
        icon: <FileText className="w-5 h-5" />,
        color: 'text-teal-500',
        gradient: 'from-teal-400 to-teal-600'
      },
      {
        id: 'scorm-export',
        title: 'Экспорт в SCORM/xAPI',
        benefit: 'Совместимость с любыми LMS. Защита инвестиций в существующую инфраструктуру.',
        icon: <Layers className="w-5 h-5" />,
        color: 'text-blue-500',
        gradient: 'from-blue-400 to-blue-600'
      }
    ]
  }
];

export default function FeaturesLanding() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [ideaText, setIdeaText] = useState('');
  const [ideaContact, setIdeaContact] = useState('');
  const [ideaSubmitted, setIdeaSubmitted] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  
  const { scrollYProgress } = useScroll();
  const opacityProgress = useTransform(scrollYProgress, [0, 0.5], [1, 0]);



  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-600 to-cyan-600 z-50 origin-left"
        style={{ scaleX: scrollYProgress }}
      />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-40 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 py-4">
            {/* Logo - Left */}
            <Link href="/" className="flex items-center gap-3 group flex-shrink-0">
              <Sparkles className="w-7 h-7 text-purple-500 group-hover:text-purple-400 transition-colors" />
              <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                MegaCampusAI Enterprise
              </span>
            </Link>

            {/* Desktop Navigation - Center */}
            <div className="hidden md:flex items-center justify-center flex-1 px-8">
              <div className="flex items-center gap-1">
              {/* Основные разделы с выпадающими подменю */}
              <div className="relative group">
                <button className="text-gray-400 hover:text-white transition-all duration-200 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800/50 flex items-center gap-1">
                  Автоматизация
                  <ChevronDown className="w-3 h-3" />
                </button>
                <div className="absolute top-full left-0 mt-2 w-56 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <button onClick={() => scrollToSection('automation')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors rounded-t-lg">
                    Контент и знания
                  </button>
                  <button onClick={() => scrollToSection('innovation')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors">
                    Инновационные технологии
                  </button>
                  <button onClick={() => scrollToSection('integration')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors rounded-b-lg">
                    Интеграции
                  </button>
                </div>
              </div>

              <div className="relative group">
                <button className="text-gray-400 hover:text-white transition-all duration-200 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800/50 flex items-center gap-1">
                  Обучение
                  <ChevronDown className="w-3 h-3" />
                </button>
                <div className="absolute top-full left-0 mt-2 w-56 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <button onClick={() => scrollToSection('personalization')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors rounded-t-lg">
                    Персонализация
                  </button>
                  <button onClick={() => scrollToSection('gamification')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors">
                    Геймификация
                  </button>
                  <button onClick={() => scrollToSection('social')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors">
                    Социальное
                  </button>
                  <button onClick={() => scrollToSection('microlearning')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors">
                    Микрообучение
                  </button>
                  <button onClick={() => scrollToSection('future-skills')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors rounded-b-lg">
                    Навыки будущего
                  </button>
                </div>
              </div>

              <div className="relative group">
                <button className="text-gray-400 hover:text-white transition-all duration-200 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800/50 flex items-center gap-1">
                  Бизнес
                  <ChevronDown className="w-3 h-3" />
                </button>
                <div className="absolute top-full left-0 mt-2 w-56 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <button onClick={() => scrollToSection('analytics')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors rounded-t-lg">
                    Аналитика и ROI
                  </button>
                  <button onClick={() => scrollToSection('compliance')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors">
                    Compliance
                  </button>
                  <button onClick={() => scrollToSection('economy')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors">
                    Экономия затрат
                  </button>
                  <button onClick={() => scrollToSection('differentiators')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors rounded-b-lg">
                    Дифференциаторы
                  </button>
                </div>
              </div>

              <div className="relative group">
                <button className="text-gray-400 hover:text-white transition-all duration-200 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800/50 flex items-center gap-1">
                  Решения
                  <ChevronDown className="w-3 h-3" />
                </button>
                <div className="absolute top-full left-0 mt-2 w-56 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <button onClick={() => scrollToSection('industry')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors rounded-t-lg">
                    Отраслевые решения
                  </button>
                  <button onClick={() => scrollToSection('russia')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors rounded-b-lg">
                    Для России
                  </button>
                </div>
              </div>
              </div>
            </div>

            {/* CTA Button - Right */}
            <div className="hidden md:flex items-center flex-shrink-0">
              <button 
                onClick={() => scrollToSection('share-ideas')}
                className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-purple-500/25 transition-all">
                Поделиться идеями
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-400 hover:text-white"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden bg-gray-900 border-t border-gray-800"
            >
              <div className="px-4 py-4 space-y-2">
                {sectionsData.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className="block w-full text-left px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    {section.title}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero Section */}
      <motion.div 
        ref={heroRef}
        className="relative min-h-screen flex items-center justify-center overflow-hidden pt-24 pb-12"
        style={{ opacity: opacityProgress }}
      >
        {/* Animated Background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-blue-600/20 to-cyan-600/20" />
          <motion.div
            animate={{
              backgroundPosition: ['0% 0%', '100% 100%'],
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              repeatType: 'reverse',
            }}
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: 'url("data:image/svg+xml,%3Csvg width="60" height="60" xmlns="http://www.w3.org/2000/svg"%3E%3Cdefs%3E%3Cpattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"%3E%3Cpath d="M 60 0 L 0 0 0 60" fill="none" stroke="white" stroke-width="0.5" opacity="0.1"/%3E%3C/pattern%3E%3C/defs%3E%3Crect width="100%25" height="100%25" fill="url(%23grid)"/%3E%3C/svg%3E")',
              backgroundSize: '60px 60px',
            }}
          />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 backdrop-blur-sm rounded-full border border-purple-500/30 mb-12">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-purple-300">200+ функций для трансформации обучения</span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-8 leading-tight">
              <span className="bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent">
                Платформа будущего
              </span>
              <br />
              <span className="text-4xl sm:text-5xl lg:text-6xl bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                для корпоративного обучения
              </span>
            </h1>

            <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-16 leading-relaxed">
              Трансформируйте корпоративное обучение с помощью AI. 
              Создавайте курсы за минуты, персонализируйте траектории, 
              измеряйте ROI каждого занятия.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-6 justify-center mb-20">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => scrollToSection('automation')}
                className="px-8 py-4 bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-semibold rounded-xl hover:shadow-2xl hover:shadow-purple-500/25 transition-all"
              >
                Узнать о возможностях будущего
              </motion.button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto mt-12">
              {[
                { label: 'Экономия времени', value: '95%', icon: <Clock className="w-5 h-5" /> },
                { label: 'ROI обучения', value: '470%', icon: <TrendingUp className="w-5 h-5" /> },
                { label: 'Вовлеченность', value: '+89%', icon: <Users className="w-5 h-5" /> },
                { label: 'Языков', value: '40+', icon: <Globe className="w-5 h-5" /> }
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                  className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6 hover:border-purple-500/50 transition-all"
                >
                  <div className="flex justify-center mb-2 text-purple-400">
                    {stat.icon}
                  </div>
                  <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                  <div className="text-sm text-gray-400">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Scroll Indicator */}
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2"
          >
            <ChevronDown className="w-8 h-8 text-gray-400" />
          </motion.div>
        </div>
      </motion.div>

      {/* Features Sections */}
      {sectionsData.map((section, sectionIndex) => (
        <motion.section
          key={section.id}
          id={section.id}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          className="py-24 relative overflow-hidden"
        >
          {/* Section Background */}
          <div className="absolute inset-0">
            <div className={`absolute inset-0 ${section.gradient} opacity-30`} />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Section Header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <div className={`inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r ${section.color} rounded-full text-white mb-6`}>
                {section.icon}
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Раздел {sectionIndex + 1}
                </span>
              </div>
              <h2 className="text-4xl lg:text-5xl font-bold text-white mb-4">
                {section.title}
              </h2>
              <p className="text-xl text-gray-400 max-w-3xl mx-auto">
                {section.subtitle}
              </p>
            </motion.div>

            {/* Features Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {section.features.map((feature, featureIndex) => (
                <motion.div
                  key={feature.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: featureIndex * 0.05 }}
                  whileHover={{ y: -8, transition: { duration: 0.2 } }}
                  className="group relative"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-600/10 to-cyan-600/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  
                  <div className="relative h-full bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 hover:border-purple-500/50 transition-all duration-300">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-3 rounded-xl bg-gradient-to-br ${feature.gradient} shadow-lg`}>
                        {feature.icon}
                      </div>
                      {feature.stats && (
                        <motion.span 
                          initial={{ scale: 0 }}
                          whileInView={{ scale: 1 }}
                          viewport={{ once: true }}
                          className="px-3 py-1 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 text-purple-300 text-xs font-bold rounded-full border border-purple-500/30"
                        >
                          {feature.stats}
                        </motion.span>
                      )}
                    </div>

                    <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-purple-400 group-hover:to-cyan-400 group-hover:bg-clip-text transition-all duration-300">
                      {feature.title}
                    </h3>
                    
                    <p className="text-gray-400 leading-relaxed">
                      {feature.benefit}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>
      ))}

      {/* Final CTA Section */}
      <section className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-blue-600/20 to-cyan-600/20" />
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
        >
          <h2 className="text-5xl font-bold text-white mb-6">
            Будущее корпоративного обучения
          </h2>
          <p className="text-xl text-gray-300 mb-12">
            Исследуйте возможности, которые станут реальностью завтра. <br/>
            Это концепция того, как может выглядеть корпоративное обучение в ближайшем будущем.
          </p>
          
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
              <div className="text-3xl font-bold text-purple-400 mb-2">200+</div>
              <div className="text-gray-400">инновационных функций</div>
            </div>
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
              <div className="text-3xl font-bold text-cyan-400 mb-2">14</div>
              <div className="text-gray-400">направлений развития</div>
            </div>
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
              <div className="text-3xl font-bold text-green-400 mb-2">∞</div>
              <div className="text-gray-400">возможностей</div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-500/20 to-cyan-500/20 backdrop-blur-sm rounded-2xl border border-purple-500/30 p-8 mb-12">
            <p className="text-lg text-gray-300 mb-4">
              <span className="text-purple-400 font-semibold">Важно:</span> Это визуализация возможного будущего корпоративного обучения.
            </p>
            <p className="text-gray-400">
              Представленные функции показывают направление развития индустрии L&D и потенциал технологий AI в образовании.
              Некоторые из этих возможностей уже реализуются, другие находятся в разработке, а часть представляет собой видение будущего.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => scrollToSection('share-ideas')}
              className="px-8 py-4 bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-semibold rounded-xl hover:shadow-2xl hover:shadow-purple-500/25 transition-all"
            >
              Поделиться своими идеями
            </motion.button>
          </div>
        </motion.div>
      </section>

      {/* Share Ideas Section */}
      <section id="share-ideas" className="py-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/30 via-gray-900 to-cyan-900/30" />
        
        <motion.div 
          className="max-w-4xl mx-auto relative z-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="text-center mb-12">
            <motion.div
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 rounded-full mb-6"
            >
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-purple-400 text-sm font-medium">Ваше видение важно</span>
            </motion.div>
            
            <h2 className="text-4xl font-bold mb-4">
              <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                Поделитесь своими идеями
              </span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Какие функции вы мечтаете увидеть в платформе будущего? 
              Мы собираем идеи для создания идеального решения для корпоративного обучения.
            </p>
          </div>

          <AnimatePresence mode="wait">
            {!ideaSubmitted ? (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700"
              >
                <div className="space-y-6">
                  <div>
                    <label htmlFor="idea" className="block text-sm font-medium text-gray-300 mb-2">
                      Опишите вашу идею
                    </label>
                    <textarea
                      id="idea"
                      value={ideaText}
                      onChange={(e) => setIdeaText(e.target.value)}
                      placeholder="Например: Было бы здорово, если бы платформа могла автоматически создавать персонализированные планы развития для каждого сотрудника..."
                      className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all resize-none"
                      rows={5}
                    />
                  </div>

                  <div>
                    <label htmlFor="contact" className="block text-sm font-medium text-gray-300 mb-2">
                      Как с вами связаться (опционально)
                    </label>
                    <input
                      id="contact"
                      type="text"
                      value={ideaContact}
                      onChange={(e) => setIdeaContact(e.target.value)}
                      placeholder="Email, Telegram или телефон"
                      className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
                    />
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={async () => {
                      if (ideaText.trim()) {
                        try {
                          // Send to Telegram via our API
                          const response = await fetch('/api/telegram/send-idea', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                              idea: ideaText,
                              contact: ideaContact,
                              source: 'Features Catalog Page'
                            })
                          });

                          if (response.ok) {
                            setIdeaSubmitted(true);
                            // Clear form after successful submission
                            setIdeaText('');
                            setIdeaContact('');
                          } else {
                            // Handle error - show error message to user
                            alert('Произошла ошибка при отправке. Пожалуйста, попробуйте еще раз.');
                          }
                        } catch {
                          // Error is already logged on server side
                          alert('Произошла ошибка при отправке. Пожалуйста, попробуйте еще раз.');
                        }
                      }
                    }}
                    disabled={!ideaText.trim()}
                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-semibold rounded-xl hover:shadow-2xl hover:shadow-purple-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Отправить идею
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gradient-to-br from-purple-900/30 to-cyan-900/30 backdrop-blur-sm rounded-2xl p-12 border border-purple-500/20 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="w-20 h-20 bg-gradient-to-br from-purple-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-6"
                >
                  <CheckCircle2 className="w-10 h-10 text-white" />
                </motion.div>
                <h3 className="text-2xl font-bold text-white mb-2">Спасибо за вашу идею!</h3>
                <p className="text-gray-400">
                  Мы ценим ваш вклад в создание будущего корпоративного обучения.
                </p>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setIdeaSubmitted(false);
                    setIdeaText('');
                    setIdeaContact('');
                  }}
                  className="mt-6 px-6 py-2 text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Поделиться ещё одной идеей
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </section>

    </div>
  );
}