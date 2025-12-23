import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { UseFormGetValues } from 'react-hook-form';
import { toast } from 'sonner';
import { logger } from '@/lib/client-logger';
import { useAuthModal } from '@/lib/hooks/use-auth-modal';
import type { FormData } from '../_schemas/form-schema';
import type { UploadedFile } from '@/components/forms/file-upload';
import { createDraftCourse, updateDraftAndStartGeneration } from '@/app/actions/courses';
import { materializeDraftSession } from '@/app/actions/draft-session';
import type { CreateCourseError } from '@/types/course-generation';
import type { Route } from 'next';

interface UseSubmitCourseProps {
  sessionId: string | null;
  draftCourseId: string | null;
  setDraftCourseId: (id: string | null) => void;
  uploadedFiles: UploadedFile[];
  uploadAllFiles: (courseId: string) => Promise<string[]>;
  getValues: UseFormGetValues<FormData>;
}

export function useSubmitCourse({
  sessionId,
  draftCourseId,
  setDraftCourseId,
  uploadedFiles,
  uploadAllFiles,
  getValues
}: UseSubmitCourseProps) {
  const router = useRouter();
  const authModal = useAuthModal();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = useCallback(async (data: FormData) => {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      const formData = getValues();
      localStorage.setItem('pendingCourseData', JSON.stringify({
        ...formData,
        files: uploadedFiles.map(f => ({
          name: f.file.name,
          size: f.file.size,
          type: f.file.type
        }))
      }));

      authModal.open('login', {
        onSuccess: () => {
          window.location.reload();
        }
      });

      toast.info("Требуется авторизация", {
        description: "Войдите или зарегистрируйтесь для создания курса. Ваши данные будут сохранены."
      });
      return;
    }

    setIsSubmitting(true);

    try {
      let finalCourseId: string;

      if (sessionId && !draftCourseId) {
        const result = await materializeDraftSession(user.id, sessionId);

        if (!result.success) {
          toast.error("Ошибка создания курса", { description: result.error });
          setIsSubmitting(false);
          return;
        }

        finalCourseId = result.data.id;
        setDraftCourseId(result.data.id);
        logger.info('Session materialized to DB', { courseId: finalCourseId, sessionId });
      } else if (draftCourseId && draftCourseId !== 'failed') {
        finalCourseId = draftCourseId;
      } else {
        const draftResult = await createDraftCourse(data.topic);
        if ('error' in draftResult) {
          toast.error("Ошибка создания черновика курса", {
            description: draftResult.error
          });
          setIsSubmitting(false);
          return;
        }
        finalCourseId = draftResult.id;
      }

      const formData = new FormData();
      formData.append('topic', data.topic);
      formData.append('course_description', data.description || '');
      formData.append('target_audience', data.targetAudience || '');
      formData.append('language', data.language || 'ru');

      if (data.writingStyle) formData.append('style', data.writingStyle);
      if (data.contentStrategy) formData.append('content_strategy', data.contentStrategy);
      formData.append('lesson_duration_minutes', String(data.lessonDuration || 5));
      formData.append('learning_outcomes', data.learningOutcomes || '');

      if (data.formats && data.formats.length > 0) {
        data.formats.forEach(format => formData.append('output_formats', format));
      }

      if (data.estimatedLessons) formData.append('estimated_lessons', data.estimatedLessons.toString());
      if (data.estimatedSections) formData.append('estimated_sections', data.estimatedSections.toString());

      if (uploadedFiles.length > 0) {
        toast.info("Загрузка файлов...", {
          description: `Загружаем ${uploadedFiles.filter(f => f.status === 'pending').length} файл(ов)`,
          duration: 3000
        });

        const fileIds = await uploadAllFiles(finalCourseId);

        fileIds.forEach(fileId => formData.append('file_ids', fileId));

        const failedFiles = uploadedFiles.filter(f => f.status === 'error');
        if (failedFiles.length > 0) {
          toast.warning("Некоторые файлы не загружены", {
            description: `${failedFiles.length} файл(ов) не удалось загрузить. Курс будет создан без них.`,
            duration: 5000
          });
        }
      }

      const result = await updateDraftAndStartGeneration(finalCourseId, formData);

      if ('error' in result) {
        const error = result as CreateCourseError;
        if (error.code === 'RATE_LIMIT_EXCEEDED') {
          toast.error("Превышен лимит создания курсов", {
            description: error.error,
            duration: 10000
          });
        } else {
          toast.error("Ошибка создания курса", {
            description: error.error || "Произошла неизвестная ошибка"
          });
        }
        setIsSubmitting(false);
        return;
      }

      toast.success("Перенаправление...", {
        description: "Переходим к отслеживанию прогресса",
        duration: 1500
      });

      router.push(`/courses/generating/${result.slug}` as Route<string>);

    } catch (error) {
      logger.error("Error creating course:", error);
      toast.error("Произошла ошибка", {
        description: error instanceof Error ? error.message : "Не удалось создать курс"
      });
      setIsSubmitting(false);
    }
  }, [sessionId, draftCourseId, setDraftCourseId, uploadedFiles, uploadAllFiles, getValues, router, authModal]);

  return { onSubmit, isSubmitting, authModal, router };
}
