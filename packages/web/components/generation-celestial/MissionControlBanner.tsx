'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Rocket, X, Eye, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react';
import { STAGE_CONFIG } from './utils';

interface MissionControlBannerProps {
  courseId: string;
  awaitingStage: number;
  onApprove: () => void;
  onCancel: () => void;
  onViewResults: () => void;
  isProcessing: boolean;
  isDark?: boolean;
}

export function MissionControlBanner({
  courseId: _courseId, // Reserved for future API calls
  awaitingStage,
  onApprove,
  onCancel,
  onViewResults,
  isProcessing,
  isDark = false
}: MissionControlBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const t = useTranslations('generation.missionControl');

  // Find stage name safely
  const stageName = Object.values(STAGE_CONFIG).find(s => s.number === awaitingStage)?.name || `Stage ${awaitingStage}`;

  // Custom button text for different stages
  const getButtonText = (compact: boolean) => {
    if (awaitingStage === 5) {
      return compact ? t('stage5.compact') : t('stage5.full');
    }
    return compact ? t('default.compact') : t('default.full');
  };

  return (
    <div className="fixed bottom-6 left-0 right-0 z-50 px-4 pointer-events-none flex justify-center">
      <motion.div 
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        className="w-full max-w-3xl pointer-events-auto"
      >
        <div className={`backdrop-blur-md rounded-xl shadow-lg overflow-hidden ${
          isDark
            ? 'bg-gray-900/95 border border-purple-500/30'
            : 'bg-white/95 border border-purple-200/50 shadow-purple-500/10'
        }`}>
          
          {/* Header / Compact View */}
          <div
            className={`px-4 py-3 flex items-center justify-between cursor-pointer transition-colors ${
              isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'
            }`}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <div className={`p-2 rounded-full border shrink-0 ${
                isDark
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-amber-50 border-amber-200 text-amber-600'
              }`}>
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className={`text-sm font-bold truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                    {stageName}: Ожидание
                  </h3>
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse shrink-0" />
                </div>
                {!isExpanded && (
                  <p className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Нажмите чтобы увидеть детали
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-2">
              {!isExpanded && (
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onApprove();
                  }}
                  disabled={isProcessing}
                  className="h-9 px-5 text-sm font-medium bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white transition-all shadow-lg shadow-purple-500/25 border-0"
                >
                  {isProcessing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <Rocket className="w-3 h-3 mr-1.5" />
                      {getButtonText(true)}
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Expanded Details */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className={`px-4 pb-4 pt-0 space-y-4 ${isDark ? 'border-t border-white/5' : 'border-t border-slate-100'}`}>
                  <div className={`pt-4 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    <p>Фаза <strong>{stageName}</strong> завершена. Пожалуйста, проверьте сгенерированные материалы перед переходом к следующему этапу.</p>
                  </div>

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onCancel}
                        disabled={isProcessing}
                        className={`h-8 text-xs ${
                          isDark
                            ? 'text-gray-400 hover:text-red-400 hover:bg-red-950/30'
                            : 'text-gray-600 hover:text-red-600 hover:bg-red-50'
                        }`}
                      >
                        <X className="w-3 h-3 mr-1.5" />
                        Отмена
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={onViewResults}
                        className={`h-8 text-xs ${
                          isDark
                            ? 'bg-gray-800 text-gray-200 hover:bg-gray-700 border-gray-700'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200'
                        }`}
                      >
                        <Eye className="w-3 h-3 mr-1.5" />
                        Просмотр
                      </Button>
                    </div>

                    <Button
                      size="sm"
                      onClick={onApprove}
                      disabled={isProcessing}
                      className="w-full sm:w-auto h-10 px-6 text-sm font-medium bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white transition-all shadow-lg shadow-purple-500/25 border-0"
                    >
                      {isProcessing ? (
                        "Подтверждение..."
                      ) : (
                        <>
                          <Rocket className="w-4 h-4 mr-2" />
                          {getButtonText(false)}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
