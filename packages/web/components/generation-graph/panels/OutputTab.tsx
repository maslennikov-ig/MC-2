'use client';

import React from 'react';
import { JsonViewer } from './shared/JsonViewer';
import { CheckCircle2 } from 'lucide-react';
import { PrioritizationView, PrioritizationViewSkeleton } from './output/PrioritizationView';
import { AnalysisResultView, AnalysisResultViewSkeleton } from './output/AnalysisResultView';
import { CourseStructureView, CourseStructureViewSkeleton } from './output/CourseStructureView';
import { LessonContentView, LessonContentViewSkeleton } from './output/LessonContentView';
import { ModuleSummaryView } from './output/ModuleSummaryView';
import { AnalysisResult, CourseStructure } from '@megacampus/shared-types';

interface OutputTabProps {
  outputData?: unknown;
  stageId?: string;
  isLoading?: boolean;
  locale?: 'ru' | 'en';
  autoFocus?: boolean;  // Auto-focus first editable field when panel opens automatically
  courseId?: string;     // Required for editing
  editable?: boolean;    // Enable edit mode
  readOnly?: boolean;    // View-only mode (hides edit and regenerate buttons)
  onApproved?: () => void; // Callback when stage is approved (closes drawer)
  nodeType?: string;     // Node type for special handling (module, lesson)
}

export const OutputTab = ({ outputData, stageId, isLoading, locale = 'ru', autoFocus = false, courseId, editable = false, readOnly = false, onApproved, nodeType }: OutputTabProps) => {
  // Show skeleton for stage_3 when loading
  if (isLoading && stageId === 'stage_3') {
    return <PrioritizationViewSkeleton />;
  }

  // Show skeleton for stage_4 when loading
  if (isLoading && stageId === 'stage_4') {
    return <AnalysisResultViewSkeleton />;
  }

  // Show skeleton for stage_5 when loading
  if (isLoading && stageId === 'stage_5') {
    return <CourseStructureViewSkeleton />;
  }

  // Show skeleton for stage_6 when loading
  if (isLoading && stageId === 'stage_6') {
    return <LessonContentViewSkeleton />;
  }

  // Render human-readable view for Stage 3 (Document Prioritization)
  // Stage 3 doesn't use outputData - it fetches directly from file_catalog
  // IMPORTANT: This check must be BEFORE isEmpty check since Stage 3 has no outputData
  if (stageId === 'stage_3' && courseId) {
    return (
      <PrioritizationView
        courseId={courseId}
        editable={editable}
        autoFocus={autoFocus}
        readOnly={readOnly}
        onApproved={onApproved}
      />
    );
  }

  // Check if outputData is empty (null, undefined, empty object, empty array)
  const isEmpty = !outputData ||
    (typeof outputData === 'object' && Object.keys(outputData as object).length === 0);

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <CheckCircle2 className="w-8 h-8 mb-2 text-success" />
        <p className="text-sm font-medium">Stage completed successfully</p>
        <p className="text-xs">No output data to display</p>
      </div>
    );
  }

  // Render human-readable view for Stage 4
  if (stageId === 'stage_4') {
    return (
      <AnalysisResultView
        data={outputData as AnalysisResult}
        locale={locale}
        courseId={courseId}
        editable={editable}
        autoFocus={autoFocus}
        readOnly={readOnly}
      />
    );
  }

  // Render human-readable view for Stage 5
  if (stageId === 'stage_5') {
    return (
      <CourseStructureView
        data={outputData as CourseStructure}
        locale={locale}
        courseId={courseId}
        editMode={editable}
        autoFocus={autoFocus}
        readOnly={readOnly}
      />
    );
  }

  // Render human-readable view for Stage 6 (modules and lessons)
  if (stageId === 'stage_6') {
    // Show module summary for module nodes
    if (nodeType === 'module') {
      return (
        <ModuleSummaryView
          data={outputData as any}
          locale={locale}
          courseId={courseId}
          readOnly={readOnly}
        />
      );
    }

    // Show lesson content for lesson nodes (default for stage 6)
    return (
      <LessonContentView
        data={outputData as any}
        locale={locale}
        courseId={courseId}
        editable={editable}
        readOnly={readOnly}
      />
    );
  }

  // Default: JSON viewer for other stages
  return <JsonViewer data={outputData} title="Output Data" defaultExpanded={true} />;
};
