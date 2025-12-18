"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Video,
  Mic,
  FileText,
  PresentationIcon,
  Edit3,
  FileSearch,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Layers,
  Target,
  Circle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import type { Section, Lesson } from "@/types/database"

interface ContentFormat {
  id: string
  name: string
  description: string
  icon: React.ElementType
  color: string
  estimatedTime: string
  webhook?: string
  available: boolean
}

const contentFormats: ContentFormat[] = [
  {
    id: "video",
    name: "Видео",
    description: "Создание видео-урока с AI аватаром",
    icon: Video,
    color: "text-red-500",
    estimatedTime: "5-10 мин",
    webhook: "https://flow8n.ru/webhook/coursegen/video",
    available: true
  },
  {
    id: "audio",
    name: "Аудио",
    description: "Озвучка текста урока с помощью AI",
    icon: Mic,
    color: "text-blue-500",
    estimatedTime: "2-3 мин",
    webhook: undefined,
    available: false
  },
  {
    id: "quiz",
    name: "Тесты",
    description: "Интерактивные тестовые вопросы по материалу",
    icon: FileText,
    color: "text-green-500",
    estimatedTime: "3-5 мин",
    webhook: undefined,
    available: false
  },
  {
    id: "presentation",
    name: "Презентация",
    description: "Автоматическое создание слайдов",
    icon: PresentationIcon,
    color: "text-purple-500",
    estimatedTime: "5-7 мин",
    webhook: undefined,
    available: false
  },
  {
    id: "exercises",
    name: "Задания",
    description: "Практические упражнения для закрепления",
    icon: Edit3,
    color: "text-orange-500",
    estimatedTime: "3-5 мин",
    webhook: undefined,
    available: false
  },
  {
    id: "summary",
    name: "Конспект",
    description: "Краткое изложение ключевых моментов",
    icon: FileSearch,
    color: "text-indigo-500",
    estimatedTime: "1-2 мин",
    webhook: undefined,
    available: false
  }
]

interface ContentGenerationPanelProps {
  open: boolean
  onClose: () => void
  courseId: string
  courseTitle: string
  courseLanguage?: string
  sections: Section[]
  lessons: Lesson[]
  selectedLessons?: string[]
  selectedSections?: string[]
}

interface GenerationStatus {
  lessonId: string
  formatId: string
  status: "pending" | "generating" | "completed" | "error"
  message?: string
}

export default function ContentGenerationPanel({
  open,
  onClose,
  courseId,
  courseTitle,
  courseLanguage = "ru",
  sections,
  lessons,
  selectedLessons = [],
  selectedSections = []
}: ContentGenerationPanelProps) {
  const [selectedFormats, setSelectedFormats] = useState<string[]>([])
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    // Initialize expanded sections on mount
    const sectionsToExpand = new Set<string>()
    selectedSections.forEach(id => sectionsToExpand.add(id))
    selectedLessons.forEach(lessonId => {
      const lesson = lessons.find(l => l.id === lessonId)
      if (lesson) {
        sectionsToExpand.add(lesson.section_id)
      }
    })
    return sectionsToExpand
  })
  const [selectedItems, setSelectedItems] = useState<Set<string>>(() => {
    // Initialize selected items on mount
    const initialSelected = new Set<string>()
    selectedLessons.forEach(id => initialSelected.add(id))
    selectedSections.forEach(sectionId => {
      const sectionLessons = lessons.filter(lesson => lesson.section_id === sectionId)
      sectionLessons.forEach(lesson => {
        initialSelected.add(lesson.id)
      })
    })
    return initialSelected
  })
  const [generationScope] = useState<"selected" | "section" | "all">("selected")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus[]>([])
  const [currentProgress, setCurrentProgress] = useState(0)

  // Group lessons by section
  const lessonsBySection = sections.reduce((acc, section) => {
    acc[section.id] = lessons.filter(lesson => lesson.section_id === section.id)
    return acc
  }, {} as Record<string, Lesson[]>)

  const toggleFormat = (formatId: string) => {
    setSelectedFormats(prev => 
      prev.includes(formatId) 
        ? prev.filter(id => id !== formatId)
        : [...prev, formatId]
    )
  }

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId)
    } else {
      newExpanded.add(sectionId)
    }
    setExpandedSections(newExpanded)
  }

  const toggleLessonSelection = (lessonId: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(lessonId)) {
      newSelected.delete(lessonId)
    } else {
      newSelected.add(lessonId)
    }
    setSelectedItems(newSelected)
  }

  const toggleSectionSelection = (sectionId: string) => {
    const newSelected = new Set(selectedItems)
    const sectionLessons = lessonsBySection[sectionId] || []
    const allSelected = sectionLessons.every(lesson => newSelected.has(lesson.id))
    
    if (allSelected) {
      sectionLessons.forEach(lesson => newSelected.delete(lesson.id))
    } else {
      sectionLessons.forEach(lesson => newSelected.add(lesson.id))
    }
    
    setSelectedItems(newSelected)
  }

  const selectAll = () => {
    const allLessonIds = lessons.map(l => l.id)
    setSelectedItems(new Set(allLessonIds))
  }

  const clearSelection = () => {
    setSelectedItems(new Set())
  }

  const getSelectedLessons = (): Lesson[] => {
    switch (generationScope) {
      case "all":
        return lessons
      case "section":
        const sectionLessons = selectedSections.flatMap(sectionId => 
          lessonsBySection[sectionId] || []
        )
        return sectionLessons.length > 0 ? sectionLessons : lessons
      case "selected":
      default:
        return lessons.filter(lesson => selectedItems.has(lesson.id))
    }
  }

  const startGeneration = async () => {
    const lessonsToGenerate = getSelectedLessons()
    
    if (lessonsToGenerate.length === 0) {
      toast.error("Выберите хотя бы один урок")
      return
    }
    
    if (selectedFormats.length === 0) {
      toast.error("Выберите хотя бы один формат контента")
      return
    }
    
    setIsGenerating(true)
    const totalTasks = lessonsToGenerate.length * selectedFormats.length
    let completedTasks = 0
    
    // Initialize status for all tasks
    const initialStatus: GenerationStatus[] = []
    lessonsToGenerate.forEach(lesson => {
      selectedFormats.forEach(formatId => {
        initialStatus.push({
          lessonId: lesson.id,
          formatId,
          status: "pending"
        })
      })
    })
    setGenerationStatus(initialStatus)
    
    // Process generation tasks
    for (const lesson of lessonsToGenerate) {
      for (const formatId of selectedFormats) {
        const format = contentFormats.find(f => f.id === formatId)
        
        // Update status to generating
        setGenerationStatus(prev => prev.map(s => 
          s.lessonId === lesson.id && s.formatId === formatId
            ? { ...s, status: "generating" }
            : s
        ))
        
        try {
          if (format?.webhook) {
            // Send webhook request
            const response = await fetch("/api/content/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                webhook: format.webhook,
                courseId,
                lessonId: lesson.id,
                lessonNumber: lesson.lesson_number,
                lessonTitle: lesson.title,
                sectionId: lesson.section_id,
                formatId,
                language: courseLanguage
              })
            })
            
            if (!response.ok) {
              throw new Error(`Failed to generate ${format.name}`)
            }
            
            // Update status to completed
            setGenerationStatus(prev => prev.map(s => 
              s.lessonId === lesson.id && s.formatId === formatId
                ? { ...s, status: "completed" }
                : s
            ))
          } else {
            // Format not available yet
            setGenerationStatus(prev => prev.map(s => 
              s.lessonId === lesson.id && s.formatId === formatId
                ? { ...s, status: "completed", message: "В разработке" }
                : s
            ))
          }
        } catch (error) {
          // Update status to error
          setGenerationStatus(prev => prev.map(s => 
            s.lessonId === lesson.id && s.formatId === formatId
              ? { ...s, status: "error", message: error instanceof Error ? error.message : "Ошибка генерации" }
              : s
          ))
        }
        
        completedTasks++
        setCurrentProgress((completedTasks / totalTasks) * 100)
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    setIsGenerating(false)
    toast.success("Генерация контента запущена")
  }

  const getStatusIcon = (status: GenerationStatus["status"]) => {
    switch (status) {
      case "pending":
        return <Circle className="w-4 h-4 text-gray-400" />
      case "generating":
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2 text-gray-900 dark:text-white">
            <Sparkles className="w-6 h-6 text-purple-500" />
            Генерация контента для курса
          </DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-400">
            {courseTitle} • {selectedItems.size} уроков выбрано
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="formats" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="formats">Форматы</TabsTrigger>
            <TabsTrigger value="lessons">Уроки</TabsTrigger>
            <TabsTrigger value="status" disabled={generationStatus.length === 0}>
              Статус {generationStatus.length > 0 && `(${generationStatus.filter(s => s.status === "completed").length}/${generationStatus.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="formats" className="flex-1 overflow-auto">
            <div className="space-y-4 p-4">
              <div className="text-sm text-muted-foreground mb-4">
                Выберите форматы контента для генерации
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {contentFormats.map(format => {
                  const Icon = format.icon
                  const isSelected = selectedFormats.includes(format.id)
                  
                  return (
                    <Card 
                      key={format.id}
                      className={`cursor-pointer transition-all bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 ${
                        isSelected ? "ring-2 ring-purple-500 dark:ring-purple-400" : ""
                      } ${!format.available ? "opacity-50" : ""}`}
                      onClick={() => format.available && toggleFormat(format.id)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg bg-gray-100 dark:bg-gray-700 ${format.color}`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div>
                              <CardTitle className="text-base text-gray-900 dark:text-white">{format.name}</CardTitle>
                              <Badge variant="secondary" className="mt-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                {format.estimatedTime}
                              </Badge>
                            </div>
                          </div>
                          <Checkbox 
                            checked={isSelected}
                            disabled={!format.available}
                            onCheckedChange={() => toggleFormat(format.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <CardDescription className="text-gray-600 dark:text-gray-400">{format.description}</CardDescription>
                        {!format.available && (
                          <Badge variant="outline" className="mt-2 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400">
                            В разработке
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="lessons" className="flex-1 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Выберите уроки для генерации контента
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll}>
                    Выбрать все
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearSelection}>
                    Очистить
                  </Button>
                </div>
              </div>
            </div>
            
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {sections.map(section => {
                  const sectionLessons = lessonsBySection[section.id] || []
                  const isExpanded = expandedSections.has(section.id)
                  const allSelected = sectionLessons.every(lesson => selectedItems.has(lesson.id))
                  const someSelected = sectionLessons.some(lesson => selectedItems.has(lesson.id))
                  
                  return (
                    <div key={section.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                      <div 
                        className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => toggleSection(section.id)}
                      >
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </Button>
                        <Checkbox
                          checked={allSelected}
                          indeterminate={!allSelected && someSelected}
                          onCheckedChange={() => toggleSectionSelection(section.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Layers className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-white">{section.title}</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {sectionLessons.length} уроков
                          </div>
                        </div>
                      </div>
                      
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: "auto" }}
                            exit={{ height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="p-2 space-y-1">
                              {sectionLessons.map(lesson => (
                                <div
                                  key={lesson.id}
                                  className="flex items-center gap-3 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                  <Checkbox
                                    checked={selectedItems.has(lesson.id)}
                                    onCheckedChange={() => toggleLessonSelection(lesson.id)}
                                  />
                                  <Target className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                  <div className="flex-1">
                                    <div className="text-sm text-gray-900 dark:text-white">{lesson.title}</div>
                                    <div className="text-xs text-gray-600 dark:text-gray-400">
                                      Урок {lesson.lesson_number} • {lesson.duration_minutes || 5} мин
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="status" className="flex-1 overflow-auto">
            <div className="p-4 space-y-4">
              {isGenerating && (
                <div className="mb-4">
                  <Progress value={currentProgress} className="mb-2" />
                  <div className="text-sm text-muted-foreground text-center">
                    Генерация контента... {Math.round(currentProgress)}%
                  </div>
                </div>
              )}
              
              <div className="space-y-3">
                {sections.map(section => {
                  const sectionLessons = lessonsBySection[section.id] || []
                  const sectionStatuses = generationStatus.filter(s => 
                    sectionLessons.some(l => l.id === s.lessonId)
                  )
                  
                  if (sectionStatuses.length === 0) return null
                  
                  return (
                    <div key={section.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
                      <div className="font-medium mb-3 text-gray-900 dark:text-white">{section.title}</div>
                      <div className="space-y-2">
                        {sectionLessons.map(lesson => {
                          const lessonStatuses = generationStatus.filter(s => s.lessonId === lesson.id)
                          if (lessonStatuses.length === 0) return null
                          
                          return (
                            <div key={lesson.id} className="pl-4">
                              <div className="text-sm font-medium mb-1 text-gray-800 dark:text-gray-200">{lesson.title}</div>
                              <div className="grid grid-cols-2 gap-2">
                                {lessonStatuses.map(status => {
                                  const format = contentFormats.find(f => f.id === status.formatId)
                                  return (
                                    <div key={`${status.lessonId}-${status.formatId}`} className="flex items-center gap-2 text-sm">
                                      {getStatusIcon(status.status)}
                                      <span className="text-gray-700 dark:text-gray-300">{format?.name}</span>
                                      {status.message && (
                                        <span className="text-xs text-gray-500 dark:text-gray-400">({status.message})</span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {selectedFormats.length} форматов • {selectedItems.size} уроков
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} className="border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                Отмена
              </Button>
              <Button 
                onClick={startGeneration}
                disabled={selectedFormats.length === 0 || selectedItems.size === 0 || isGenerating}
                className="bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-500 dark:hover:bg-purple-600"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Генерация...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Запустить генерацию
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}