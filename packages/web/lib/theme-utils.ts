// Утилиты для управления темами и классами Tailwind
export const themeClasses = {
  // Фоны - использующие дизайн-токены
  background: {
    primary: "bg-background",
    secondary: "bg-muted",
    card: "bg-card",
    cardHover: "hover:bg-muted/50",
    input: "bg-background",
    overlay: "bg-background/80 backdrop-blur-sm",
  },
  
  // Текст - использующие дизайн-токены
  text: {
    primary: "text-foreground",
    secondary: "text-muted-foreground",
    muted: "text-muted-foreground",
    inverse: "text-background",
  },
  
  // Границы - использующие дизайн-токены
  border: {
    primary: "border-border",
    secondary: "border-border",
    focus: "focus:border-primary focus:ring-2 focus:ring-ring focus:ring-offset-2",
  },
  
  // Кнопки - использующие дизайн-токены
  button: {
    primary: "bg-primary hover:bg-primary/90 text-primary-foreground",
    secondary: "bg-secondary hover:bg-secondary/80 text-secondary-foreground",
    ghost: "text-foreground hover:bg-muted",
  },
  
  // Badges статусов - использующие семантические токены
  badge: {
    completed: "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] border-[hsl(var(--success))]/20",
    generating: "bg-[hsl(var(--info))] text-[hsl(var(--info-foreground))]",
    draft: "bg-[hsl(var(--status-draft))]/10 text-[hsl(var(--status-draft))] border-[hsl(var(--status-draft))]/20",
    failed: "bg-[hsl(var(--danger))] text-[hsl(var(--danger-foreground))] border-[hsl(var(--danger))]/20",
  },
  
  // Badges сложности - использующие семантические токены
  difficulty: {
    beginner: "border-[hsl(var(--success))]/30 text-[hsl(var(--success))] bg-[hsl(var(--success))]/10",
    intermediate: "border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10",
    advanced: "border-orange-500/30 text-orange-700 dark:text-orange-400 bg-orange-500/10",
    master: "border-primary/30 text-primary bg-primary/10",
    expert: "border-[hsl(var(--danger))]/30 text-[hsl(var(--danger))] bg-[hsl(var(--danger))]/10",
    mixed: "border-[hsl(var(--info))]/30 text-[hsl(var(--info))] bg-[hsl(var(--info))]/10",
  },
  
  // Градиенты - использующие дизайн-токены
  gradient: {
    main: "bg-gradient-to-br from-background via-primary/5 to-muted",
    card: "bg-gradient-to-b from-card to-muted/50",
  },
  
  // Эффекты
  shadow: {
    sm: "shadow-sm hover:shadow-md transition-shadow",
    md: "shadow-md hover:shadow-lg transition-shadow",
    lg: "shadow-lg transition-shadow",
  },
  
  // Transition
  transition: "transition-colors duration-200 ease-in-out",
}

// Helper для объединения классов темы
export function getThemeClass(...classes: (string | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

// Helper для получения класса по статусу
export function getStatusClass(status: string): string {
  switch (status) {
    case 'completed':
      return themeClasses.badge.completed
    case 'generating':
    case 'processing':
    case 'structure_ready':
      return themeClasses.badge.generating
    case 'draft':
      return themeClasses.badge.draft
    case 'failed':
      return themeClasses.badge.failed
    default:
      return themeClasses.badge.draft
  }
}

// Helper для получения класса по сложности
export function getDifficultyClass(difficulty?: string): string {
  switch (difficulty?.toLowerCase()) {
    case 'beginner':
      return themeClasses.difficulty.beginner
    case 'intermediate':
      return themeClasses.difficulty.intermediate
    case 'advanced':
      return themeClasses.difficulty.advanced
    case 'master':
      return themeClasses.difficulty.master
    case 'expert':
      return themeClasses.difficulty.expert
    case 'mixed':
      return themeClasses.difficulty.mixed
    default:
      return themeClasses.difficulty.beginner
  }
}