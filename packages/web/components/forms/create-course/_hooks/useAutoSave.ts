import { useCallback, useRef, useEffect } from 'react';
import { UseFormGetValues } from 'react-hook-form';
import { createClient } from '@/lib/supabase/client';
import { updateDraftSession } from '@/app/actions/draft-session';
import { logger } from '@/lib/client-logger';
import type { FormData } from '../_schemas/form-schema';
import type { DraftFormData } from '@/lib/draft-session';

export function useAutoSave(sessionId: string | null, getValues: UseFormGetValues<FormData>) {
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const autoSaveToRedis = useCallback(async (formData: Partial<DraftFormData>) => {
    if (!sessionId) return;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const result = await updateDraftSession(user.id, sessionId, formData);
      if (!result.success) {
        logger.debug('Auto-save skipped (Redis unavailable)', { error: result.error });
      } else {
        logger.debug('Form auto-saved to Redis', { sessionId });
      }
    } catch (error) {
      logger.debug('Auto-save skipped', { error });
    }
  }, [sessionId]);

  const handleFormChange = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      const currentValues = getValues();
      const draftFormData: Partial<DraftFormData> = {
        topic: currentValues.topic,
        description: currentValues.description,
        language: currentValues.language,
        email: currentValues.email,
        writingStyles: currentValues.writingStyle ? [currentValues.writingStyle] : undefined,
        outputFormats: currentValues.formats || undefined,
      };
      autoSaveToRedis(draftFormData);
    }, 3000);
  }, [autoSaveToRedis, getValues]);

  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  return { handleFormChange };
}
