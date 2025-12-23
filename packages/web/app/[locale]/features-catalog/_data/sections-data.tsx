import React from 'react';
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
  Clock,
  BookOpen,
  Play,
  Cpu
} from 'lucide-react';
import { Section } from '../_types';

export const sectionsData: Section[] = [
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