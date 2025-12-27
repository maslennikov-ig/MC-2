'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Rocket, Play, X, Eye, AlertTriangle, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { STAGE_CONFIG } from './utils';

const getStorageKey = (courseId: string) => `mission-control-banner-minimized-${courseId}`;

interface MissionControlBannerProps {
  courseId: string;
  awaitingStage: number;
  onApprove: () => void;
  onCancel: () => void;
  onViewResults: () => void;
  isProcessing: boolean;
  isDark?: boolean;
  /** When true, banner auto-minimizes (e.g., when node panel is open) */
  isNodePanelOpen?: boolean;
}

export function MissionControlBanner({
  courseId,
  awaitingStage,
  onApprove,
  onCancel,
  onViewResults,
  isProcessing,
  isDark = false,
  isNodePanelOpen = false
}: MissionControlBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const t = useTranslations('generation.missionControl');

  // Swipe tracking
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-100, 0], [0.5, 1]);

  // Load minimized state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(getStorageKey(courseId));
    if (saved === 'true') {
      setIsMinimized(true);
    }
  }, [courseId]);

  // Auto-minimize when node panel opens
  useEffect(() => {
    if (isNodePanelOpen) {
      setIsMinimized(true);
      localStorage.setItem(getStorageKey(courseId), 'true');
    }
  }, [isNodePanelOpen, courseId]);

  // Save minimized state to localStorage
  const toggleMinimized = useCallback((minimized: boolean) => {
    setIsMinimized(minimized);
    localStorage.setItem(getStorageKey(courseId), String(minimized));
  }, [courseId]);

  // Handle swipe gestures
  const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    // Swipe left to minimize (velocity or distance threshold)
    if (info.velocity.x < -500 || info.offset.x < -100) {
      toggleMinimized(true);
    }
    // Reset position
    x.set(0);
  }, [toggleMinimized, x]);

  // Find stage name safely
  const stageName = Object.values(STAGE_CONFIG).find(s => s.number === awaitingStage)?.name || `Stage ${awaitingStage}`;

  // Check if this is the initial launch stage
  const isInitialStage = awaitingStage === 0;

  // Get stage-specific translation key
  const getStageKey = () => {
    if (awaitingStage === 0) return 'stage0';
    if (awaitingStage === 5) return 'stage5';
    return 'default';
  };

  // Custom button text for different stages
  const getButtonText = (compact: boolean) => {
    const stageKey = getStageKey();
    return compact ? t(`${stageKey}.compact`) : t(`${stageKey}.full`);
  };

  // Get description text for the expanded view
  const getDescription = () => {
    const stageKey = getStageKey();
    if (stageKey === 'default') {
      return t('default.description', { stageName });
    }
    return t(`${stageKey}.description`);
  };

  // Get hint text for the collapsed view
  const getHint = () => {
    const stageKey = getStageKey();
    return t(`${stageKey}.hint`);
  };

  // Get the appropriate icon for the button
  const ButtonIcon = isInitialStage ? Play : Rocket;

  return (
    <AnimatePresence mode="wait">
      {isMinimized ? (
        /* Edge Tab - minimized state */
        <motion.div
          key="edge-tab"
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed bottom-6 right-0 z-50 pointer-events-auto"
        >
          <motion.button
            onClick={() => toggleMinimized(false)}
            whileTap={{ scale: 0.98 }}
            className={`group flex items-center gap-1.5 pr-2 py-2.5 rounded-l-xl shadow-lg backdrop-blur-md transition-all duration-200 pl-3 hover:pl-5 ${
              isDark
                ? 'bg-gray-900/95 border border-r-0 border-amber-500/30 hover:bg-gray-800/95 hover:border-amber-400/50'
                : 'bg-white/95 border border-r-0 border-amber-200/50 hover:bg-gray-50/95 hover:border-amber-300/70'
            }`}
            aria-label="Развернуть панель подтверждения"
          >
            <div className={`p-1 rounded-full border shrink-0 ${
              isDark
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-amber-50 border-amber-200 text-amber-600'
            }`}>
              <AlertTriangle className="w-3 h-3" />
            </div>
            <span className={`text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              {awaitingStage}
            </span>
            {isProcessing && (
              <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
            )}
            <ChevronLeft className={`w-3 h-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          </motion.button>
        </motion.div>
      ) : (
        /* Main Control Banner - full state */
        <motion.div
          key="full-banner"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ x: 200, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed bottom-6 left-0 right-0 z-50 px-4 pointer-events-none flex justify-center"
        >
          <motion.div
            drag="x"
            dragConstraints={{ left: -150, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            style={{ x, opacity }}
            className="w-full max-w-3xl pointer-events-auto touch-pan-y"
            title="Смахните влево, чтобы свернуть"
          >
            <div className={`backdrop-blur-md rounded-xl shadow-lg overflow-hidden ${
              isDark
                ? 'bg-gray-900/95 border border-amber-500/30'
                : 'bg-white/95 border border-amber-200/50 shadow-amber-500/10'
            }`}>

              {/* Header / Compact View */}
              <div
                className={`px-4 py-3 flex items-center justify-between cursor-pointer transition-colors ${
                  isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'
                }`}
                onClick={() => setIsExpanded(!isExpanded)}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  {/* Drag grip indicator */}
                  <div className="flex flex-col gap-0.5 mr-2">
                    <div className={`w-0.5 h-0.5 rounded-full ${isDark ? 'bg-gray-500' : 'bg-gray-300'}`} />
                    <div className={`w-0.5 h-0.5 rounded-full ${isDark ? 'bg-gray-500' : 'bg-gray-300'}`} />
                    <div className={`w-0.5 h-0.5 rounded-full ${isDark ? 'bg-gray-500' : 'bg-gray-300'}`} />
                  </div>
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
                        {stageName}: {t('awaitingStatus')}
                      </h3>
                      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse shrink-0" />
                    </div>
                    {!isExpanded && (
                      <p className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {getHint()}
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
                          <ButtonIcon className="w-3 h-3 mr-1.5" />
                          {getButtonText(true)}
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpanded(!isExpanded);
                    }}
                    className={`h-8 w-8 ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </Button>
                  {/* Minimize button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMinimized(true);
                    }}
                    className={`p-1.5 rounded-md transition-colors ${
                      isDark
                        ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-slate-100'
                    }`}
                    aria-label="Свернуть панель"
                    title="Свернуть (или смахните влево)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
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
                        <p>{getDescription()}</p>
                        <p className="mt-2 text-xs text-gray-500 italic">Смахните влево, чтобы свернуть</p>
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
                            {t('cancel')}
                          </Button>
                          {/* Only show View button when there are results to view (not for initial stage) */}
                          {!isInitialStage && (
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
                              {t('view')}
                            </Button>
                          )}
                        </div>

                        <Button
                          size="sm"
                          onClick={onApprove}
                          disabled={isProcessing}
                          className="w-full sm:w-auto h-10 px-6 text-sm font-medium bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white transition-all shadow-lg shadow-purple-500/25 border-0"
                        >
                          {isProcessing ? (
                            t('confirming')
                          ) : (
                            <>
                              <ButtonIcon className="w-4 h-4 mr-2" />
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
        </motion.div>
      )}
    </AnimatePresence>
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
