import React from "react";
import { motion } from "framer-motion";
import { FolderOpen, Info } from "lucide-react";
import { FileUpload, UploadedFile } from '@/components/forms/file-upload';

interface UploadSectionProps {
  draftCourseId: string | null;
  uploadedFiles: UploadedFile[];
  setUploadedFiles: (files: UploadedFile[]) => void;
  uploadSingleFile: (file: UploadedFile, courseId: string) => Promise<string | null>;
  isSubmitting: boolean;
  isUploadingFiles: boolean;
}

export function UploadSection({
  draftCourseId,
  uploadedFiles,
  setUploadedFiles,
  uploadSingleFile,
  isSubmitting,
  isUploadingFiles
}: UploadSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="bg-white/90 dark:bg-black/70 backdrop-blur-xl rounded-2xl p-4 sm:p-6 md:p-8 border border-slate-200 dark:border-white/10 xl:col-span-1"
    >
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-3">
        <FolderOpen className="w-6 h-6 text-purple-500 dark:text-purple-400" />
        Загрузка учебных материалов (необязательно)
      </h2>

      <div className="mb-4 p-4 bg-purple-50 dark:bg-black/30 backdrop-blur-md border border-purple-200 dark:border-purple-400/30 rounded-lg flex items-start gap-3">
        <Info className="w-5 h-5 text-purple-500 dark:text-purple-400 mt-0.5" />
        <div className="text-slate-700 dark:text-white/80 text-sm">
          <p className="font-medium mb-1">Загрузите материалы для анализа и генерации курса</p>
          <p>Поддерживаются: PDF, DOCX, TXT, MD и другие форматы. Максимум 50MB на файл.</p>
          <p className="text-slate-500 dark:text-white/60 mt-1">Файлы будут использованы как основа для создания курса. Система проанализирует содержание и создаст структурированные уроки.</p>
        </div>
      </div>

      <FileUpload
        courseId={draftCourseId}
        uploadedFiles={uploadedFiles}
        onFilesChange={setUploadedFiles}
        onUploadFile={async (file) => {
          if (!draftCourseId) return null;
          return uploadSingleFile(file, draftCourseId);
        }}
        disabled={isSubmitting || isUploadingFiles}
        maxFiles={10}
      />

      {uploadedFiles.filter(f => f.status === 'success').length > 0 && (
        <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <p className="text-green-400 text-sm">
            Загружено файлов: {uploadedFiles.filter(f => f.status === 'success').length}. Они будут использованы для генерации курса.
          </p>
        </div>
      )}
    </motion.div>
  );
}
