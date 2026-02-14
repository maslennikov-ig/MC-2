import type { Proposal } from '@megacampus/shared-types/chat-types';
import type { CourseStructure, Section, Lesson } from '@megacampus/shared-types';
import {
  resolveTargetPath,
  resolveTargetPathWithMatches,
  getElementAtPath,
  isLessonPath,
  type ClassifiedIntent,
  type TargetMatch,
} from '../../../../shared/intent';

const FUZZY_MATCH_CONFIDENCE_THRESHOLD = 0.7;

export interface DirectIntentResult {
  message: string;
  proposal?: Proposal;
  requiresClarification?: boolean;
}

export function formatMultipleMatchesMessage(matches: TargetMatch[]): string {
  const matchList = matches
    .slice(0, 5)
    .map((m, idx) => `${idx + 1}) ${m.displayLabel}: ${m.title}`)
    .join('\n');

  return `Найдено несколько совпадений:\n${matchList}\n\nУточните, какой именно элемент вы имеете в виду.`;
}

function handleDeleteIntent(
  courseStructure: CourseStructure,
  targetPath: string
): DirectIntentResult {
  const element = getElementAtPath(courseStructure, targetPath);
  if (!element) {
    return { message: 'Элемент не найден.' };
  }

  const isSection = !isLessonPath(targetPath);
  const title = isSection ? (element as Section).section_title : (element as Lesson).lesson_title;
  const stableId = element.id;

  if (!stableId) {
    return {
      message: 'Элемент не имеет стабильного идентификатора. Попробуйте обновить страницу.',
    };
  }

  const lessonCount = isSection ? (element as Section).lessons.length : 0;

  return {
    message: `Удалить "${title}"?`,
    proposal: {
      type: 'structural_operation',
      operations: [
        {
          type: 'delete_element',
          targetId: stableId,
        },
      ],
      summary: isSection
        ? `Удаление секции "${title}" (${lessonCount} ${lessonCount === 1 ? 'урок' : 'уроков'})`
        : `Удаление урока "${title}"`,
    },
  };
}

type MovePlacement = { afterId: string | null; newParentId?: string };
type MovePlacementResult = { placement: MovePlacement } | { clarification: DirectIntentResult };

const COURSE_LEVEL_FIELDS = new Set([
  'course_title',
  'course_description',
  'course_overview',
  'target_audience',
]);

const LESSON_FIELD_ALIASES: Record<string, string> = {
  title: 'lesson_title',
  lesson_title: 'lesson_title',
  objectives: 'lesson_objectives',
  lesson_objectives: 'lesson_objectives',
  topics: 'key_topics',
  key_topics: 'key_topics',
  duration: 'estimated_duration_minutes',
  estimated_duration_minutes: 'estimated_duration_minutes',
};

const SECTION_FIELD_ALIASES: Record<string, string> = {
  title: 'section_title',
  section_title: 'section_title',
  description: 'section_description',
  section_description: 'section_description',
  objectives: 'learning_objectives',
  learning_objectives: 'learning_objectives',
};

function resolveLessonMovePlacement(
  courseStructure: CourseStructure,
  destPath: string,
  destElementId: string,
  sourceId: string
): MovePlacementResult {
  const destinationIsSection = !isLessonPath(destPath);

  if (destinationIsSection) {
    const sectionIdxMatch = destPath.match(/sections\[(\d+)\]/);
    if (!sectionIdxMatch) {
      return {
        clarification: {
          message: 'Не удалось определить секцию назначения.',
          requiresClarification: true,
        },
      };
    }

    const targetSection = courseStructure.sections[parseInt(sectionIdxMatch[1], 10)];
    const lastLesson = targetSection?.lessons
      ? [...targetSection.lessons].reverse().find(lesson => lesson.id !== sourceId)
      : null;
    return {
      placement: {
        newParentId: destElementId,
        afterId: lastLesson?.id ?? null,
      },
    };
  }

  const sectionMatch = destPath.match(/sections\[(\d+)\]/);
  if (!sectionMatch) {
    return {
      clarification: {
        message: 'Не удалось определить секцию для урока назначения.',
        requiresClarification: true,
      },
    };
  }

  const parentSection = courseStructure.sections[parseInt(sectionMatch[1], 10)];
  if (!parentSection?.id) {
    return {
      clarification: {
        message: 'Секция назначения не имеет стабильного идентификатора.',
        requiresClarification: true,
      },
    };
  }

  return {
    placement: {
      newParentId: parentSection.id,
      afterId: destElementId,
    },
  };
}

function resolveMovePlacement(
  courseStructure: CourseStructure,
  sourceIsSection: boolean,
  destPath: string,
  sourceId: string
): MovePlacementResult {
  if (sourceIsSection && isLessonPath(destPath)) {
    return {
      clarification: {
        message:
          'Секцию можно перемещать только относительно другой секции. Укажите секцию назначения.',
        requiresClarification: true,
      },
    };
  }

  const destElement = getElementAtPath(courseStructure, destPath);
  if (!destElement?.id) {
    return {
      clarification: {
        message: 'Не удалось определить элемент назначения.',
        requiresClarification: true,
      },
    };
  }
  if (destElement.id === sourceId) {
    return {
      clarification: {
        message: 'Источник и место назначения совпадают. Укажите другую позицию.',
        requiresClarification: true,
      },
    };
  }

  if (sourceIsSection) {
    return { placement: { afterId: destElement.id } };
  }

  return resolveLessonMovePlacement(courseStructure, destPath, destElement.id, sourceId);
}

function handleMoveIntent(
  intent: ClassifiedIntent,
  courseStructure: CourseStructure,
  targetPath: string
): DirectIntentResult {
  if (!intent.destination) {
    return {
      message: 'Укажите, куда переместить элемент. Например: "Перемести после урока 3".',
      requiresClarification: true,
    };
  }

  const sourceElement = getElementAtPath(courseStructure, targetPath);
  if (!sourceElement) {
    return { message: 'Исходный элемент не найден.' };
  }

  const sourceId = sourceElement.id;
  if (!sourceId) {
    return {
      message: 'Элемент не имеет стабильного идентификатора. Попробуйте обновить страницу.',
    };
  }

  const isSection = !isLessonPath(targetPath);
  const title = isSection
    ? (sourceElement as Section).section_title
    : (sourceElement as Lesson).lesson_title;

  const destPath = resolveTargetPath(intent.destination, undefined, courseStructure);
  if (!destPath) {
    return {
      message: 'Не удалось определить место назначения.',
      requiresClarification: true,
    };
  }

  const movePlacement = resolveMovePlacement(courseStructure, isSection, destPath, sourceId);
  if ('clarification' in movePlacement) {
    return movePlacement.clarification;
  }

  return {
    message: `Переместить "${title}"?`,
    proposal: {
      type: 'structural_operation',
      operations: [
        {
          type: 'move_element',
          targetId: sourceId,
          newParentId: movePlacement.placement.newParentId,
          afterId: movePlacement.placement.afterId,
        },
      ],
      summary: `Перемещение "${title}"`,
    },
  };
}

function handleUpdateFieldIntent(
  intent: ClassifiedIntent,
  stageId: 'stage_4' | 'stage_5',
  targetPath?: string
): DirectIntentResult {
  if (!intent.fieldName || intent.newValue === undefined) {
    return {
      message: 'Уточните, какое поле и на какое значение изменить.',
      requiresClarification: true,
    };
  }

  const fieldName = String(intent.fieldName).trim();
  const fieldLooksLikePath = fieldName.includes('.') || fieldName.includes('[');
  let updatePath = fieldName;

  if (stageId === 'stage_5' && !fieldLooksLikePath) {
    if (targetPath) {
      const aliasMap = isLessonPath(targetPath) ? LESSON_FIELD_ALIASES : SECTION_FIELD_ALIASES;
      const resolvedField = aliasMap[fieldName];
      if (!resolvedField) {
        return {
          message: `Поле "${fieldName}" не поддерживается для выбранного элемента.`,
          requiresClarification: true,
        };
      }
      updatePath = `${targetPath}.${resolvedField}`;
    } else if (COURSE_LEVEL_FIELDS.has(fieldName)) {
      updatePath = fieldName;
    } else {
      return {
        message:
          'Уточните, для какого именно урока или секции нужно изменить поле, либо укажите полный путь поля.',
        requiresClarification: true,
      };
    }
  }

  const displayValue =
    typeof intent.newValue === 'string' ? intent.newValue : JSON.stringify(intent.newValue);

  return {
    message: `Изменить ${updatePath} на "${displayValue}"?`,
    proposal: {
      type: 'field_updates',
      stageId,
      updates: [
        {
          path: updatePath,
          oldValue: null,
          newValue: intent.newValue,
        },
      ],
      summary: `Обновление поля ${updatePath}`,
    },
  };
}

function resolveDirectIntentTarget(
  intent: ClassifiedIntent,
  courseStructure: CourseStructure,
  nodeContextPath?: string
): { targetPath: string } | { clarification: DirectIntentResult } {
  const matches = resolveTargetPathWithMatches(
    intent.target?.identifier,
    intent.target?.path,
    courseStructure,
    nodeContextPath
  );

  if (matches.length === 0) {
    return {
      clarification: {
        message:
          'Не удалось определить элемент. Уточните, какой именно урок или секцию вы хотите изменить.',
        requiresClarification: true,
      },
    };
  }

  const highConfidenceMatches = matches.filter(
    m => m.confidence >= FUZZY_MATCH_CONFIDENCE_THRESHOLD
  );

  if (highConfidenceMatches.length > 1) {
    return {
      clarification: {
        message: formatMultipleMatchesMessage(highConfidenceMatches),
        requiresClarification: true,
      },
    };
  }

  const bestMatch = matches[0];
  if (bestMatch.confidence < FUZZY_MATCH_CONFIDENCE_THRESHOLD && matches.length > 1) {
    return {
      clarification: {
        message: formatMultipleMatchesMessage(matches),
        requiresClarification: true,
      },
    };
  }

  return { targetPath: bestMatch.path };
}

export function handleDirectIntent(
  intent: ClassifiedIntent,
  courseStructure: CourseStructure,
  nodeContextPath?: string,
  stageId?: string
): DirectIntentResult {
  if (intent.intent === 'UPDATE_FIELD') {
    const resolvedStageId: 'stage_4' | 'stage_5' = stageId === 'stage_4' ? 'stage_4' : 'stage_5';
    const hasTargetHint = Boolean(intent.target?.identifier || intent.target?.path);

    if (!hasTargetHint) {
      return handleUpdateFieldIntent(intent, resolvedStageId);
    }

    const resolved = resolveDirectIntentTarget(intent, courseStructure, nodeContextPath);
    if ('clarification' in resolved) {
      return handleUpdateFieldIntent(intent, resolvedStageId);
    }

    return handleUpdateFieldIntent(intent, resolvedStageId, resolved.targetPath);
  }

  const resolved = resolveDirectIntentTarget(intent, courseStructure, nodeContextPath);

  if ('clarification' in resolved) {
    return resolved.clarification;
  }

  const { targetPath } = resolved;

  switch (intent.intent) {
    case 'DELETE_LESSON':
    case 'DELETE_SECTION':
      return handleDeleteIntent(courseStructure, targetPath);

    case 'MOVE_ELEMENT':
      return handleMoveIntent(intent, courseStructure, targetPath);

    default:
      return { message: 'Операция не поддерживается.' };
  }
}
