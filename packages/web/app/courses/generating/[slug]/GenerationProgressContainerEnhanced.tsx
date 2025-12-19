'use client';

import { useEffect, useReducer, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
// import { useTheme } from 'next-themes'; // DISABLED: MissionControlBanner moved to GraphView
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  GenerationProgress,
  GenerationStep,
  CourseStatus,
  ProgressState,
  ProgressAction,
} from '@/types/course-generation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Mail, Clock } from 'lucide-react';
// DISABLED: MissionControlBanner handlers moved to GraphView
// import { approveStage, cancelGeneration, startGeneration } from '@/app/actions/admin-generation';
import { GraphViewWrapper } from '@/components/generation-graph';

// Celestial Design Imports
import {
  CelestialHeader,
  SpaceBackground,
  // MissionControlBanner - DISABLED: Now rendered inside GraphView
  // StageResultsDrawer - DISABLED: Replaced by NodeDetailsDrawer in GraphView
} from '@/components/generation-celestial';
import StatsGrid from '@/components/generation/StatsGrid';

/** Default fallback when lessons count is unknown (before Stage 4 analysis completes) */
const DEFAULT_LESSONS_COUNT = 5;

interface GenerationProgressContainerProps {
  courseId: string;
  slug: string;
  initialProgress: GenerationProgress;
  initialStatus: CourseStatus;
  courseTitle: string;
  onComplete?: (courseId: string) => void;
  onError?: (error: Error) => void;
  showDebugInfo?: boolean;
  autoRedirect?: boolean;
  redirectDelay?: number;
  userRole?: string | null;
  failedAtStage?: number | null;
  /** Human-readable generation code (e.g., "ABC-1234") for debugging */
  generationCode?: string | null;
}

// Session storage keys
const STORAGE_KEY_PREFIX = 'course-generation-';
const STORAGE_KEY_STATE = (courseId: string) => `${STORAGE_KEY_PREFIX}${courseId}-state`;
const STORAGE_KEY_TIMESTAMP = (courseId: string) => `${STORAGE_KEY_PREFIX}${courseId}-timestamp`;

// Enhanced action types
type EnhancedProgressAction = ProgressAction
  | { type: 'RESTORE_STATE'; payload: ProgressState }
  | { type: 'SET_LONG_RUNNING'; payload: boolean }
  | { type: 'SET_EMAIL_NOTIFICATION'; payload: boolean }
  | { type: 'INCREMENT_RETRY'; payload: { stepIndex: number } }
  | { type: 'SHOW_TOAST'; payload: { type: 'success' | 'error' | 'warning' | 'info'; message: string } }
  | { type: 'CLEAR_TOAST' };

// Enhanced state interface
interface EnhancedProgressState extends ProgressState {
  isLongRunning: boolean;
  emailNotificationRequested: boolean;
  longRunningStartTime?: Date;
  stepRetryCount: Map<number, number>;
  toast: {
    show: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
  } | null;
}

// Enhanced progress reducer
function enhancedProgressReducer(state: EnhancedProgressState, action: EnhancedProgressAction): EnhancedProgressState {
  switch (action.type) {
    case 'UPDATE_PROGRESS':
      return {
        ...state,
        progress: action.payload,
        activityLog: [
          ...state.activityLog,
          {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            type: 'info',
            message: action.payload.message,
          }
        ]
      };

    case 'SET_STATUS':
      return {
        ...state,
        status: action.payload,
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        activityLog: action.payload ? [
          ...state.activityLog,
          {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            type: 'error',
            message: action.payload.message,
          }
        ] : state.activityLog
      };

    case 'SET_CONNECTED':
      return {
        ...state,
        isConnected: action.payload,
      };

    case 'ADD_ACTIVITY':
      return {
        ...state,
        activityLog: [...state.activityLog, action.payload],
      };

    case 'RETRY_STEP':
      return {
        ...state,
        retryAttempts: state.retryAttempts + 1,
      };

    case 'UPDATE_ESTIMATE':
      return {
        ...state,
        estimatedTime: action.payload,
      };

    case 'CHANGE_TAB':
      return {
        ...state,
        activeTab: action.payload,
      };

    case 'RESTORE_STATE':
      return action.payload as EnhancedProgressState;

    case 'SET_LONG_RUNNING':
      return {
        ...state,
        isLongRunning: action.payload,
        longRunningStartTime: action.payload ? new Date() : undefined,
      };

    case 'SET_EMAIL_NOTIFICATION':
      return {
        ...state,
        emailNotificationRequested: action.payload,
      };

    case 'INCREMENT_RETRY':
      const newRetryCount = new Map(state.stepRetryCount);
      const currentCount = newRetryCount.get(action.payload.stepIndex) || 0;
      newRetryCount.set(action.payload.stepIndex, currentCount + 1);
      return {
        ...state,
        stepRetryCount: newRetryCount,
      };

    case 'SHOW_TOAST':
      return {
        ...state,
        toast: {
          show: true,
          type: action.payload.type,
          message: action.payload.message,
        },
      };

    case 'CLEAR_TOAST':
      return {
        ...state,
        toast: null,
      };

    default:
      return state;
  }
}

export default function GenerationProgressContainerEnhanced({
  courseId,
  slug,
  initialProgress,
  initialStatus,
  courseTitle,
  onComplete,
  onError,
  showDebugInfo = false,
  autoRedirect = true,
  redirectDelay = 3000,
  userRole: _userRole = null,
  failedAtStage,
  generationCode,
}: GenerationProgressContainerProps) {
  const router = useRouter();
  // isDark - DISABLED: MissionControlBanner moved to GraphView
  // const { resolvedTheme } = useTheme();
  // const isDark = resolvedTheme === 'dark';
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);
  const redirectTimeout = useRef<NodeJS.Timeout | null>(null);
  const longRunningTimeout = useRef<NodeJS.Timeout | null>(null);
  const toastTimeout = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Refs to preserve last known values for modules/lessons counts (survives realtime updates that don't include analysis_result)
  const lastKnownModulesTotal = useRef<number | undefined>(initialProgress.modules_total);
  const lastKnownLessonsTotal = useRef<number>(initialProgress.lessons_total || DEFAULT_LESSONS_COUNT);

  // Initial enhanced state
  const getInitialState = (): EnhancedProgressState => {
    // Try to restore from session storage
    if (typeof window !== 'undefined') {
      const storedState = sessionStorage.getItem(STORAGE_KEY_STATE(courseId));
      const storedTimestamp = sessionStorage.getItem(STORAGE_KEY_TIMESTAMP(courseId));

      if (storedState && storedTimestamp) {
        const timestamp = new Date(storedTimestamp);
        const now = new Date();
        const ageMinutes = (now.getTime() - timestamp.getTime()) / (1000 * 60);

        // Only restore if less than 30 minutes old
        if (ageMinutes < 30) {
          try {
            const parsed = JSON.parse(storedState);
            // Convert Map from JSON
            parsed.stepRetryCount = new Map(parsed.stepRetryCount || []);
            // Merge with initialProgress - server data (modules_total, lessons_total) takes priority
            // because analysis_result may have been updated after session storage was saved
            const mergedProgress = {
              ...parsed.progress,
              modules_total: initialProgress.modules_total ?? parsed.progress?.modules_total,
              lessons_total: initialProgress.lessons_total ?? parsed.progress?.lessons_total ?? DEFAULT_LESSONS_COUNT,
            };
            return {
              ...parsed,
              progress: mergedProgress,
              status: initialStatus, // Always use server status
              toast: null, // Don't restore toasts
            };
          } catch {
            // Failed to parse stored state - will use fresh state
          }
        }
      }
    }

    // Return fresh state
    return {
      progress: initialProgress,
      status: initialStatus,
      error: null,
      isConnected: false,
      activeTab: 'overview',
      activityLog: [
        {
          id: '1',
          timestamp: new Date(),
          type: 'info',
          message: 'Course generation started',
        }
      ],
      retryAttempts: 0,
      estimatedTime: 180,
      isLongRunning: false,
      emailNotificationRequested: false,
      stepRetryCount: new Map(),
      toast: null,
    };
  };

  const [state, dispatch] = useReducer(enhancedProgressReducer, null, getInitialState);
  const [showSuccess, setShowSuccess] = useState(false);
  const hasTriggeredConfetti = useRef(false);

  // DISABLED: All below moved to GraphView - MissionControlBanner and StageResultsDrawer
  // const [detailsStageId, setDetailsStageId] = useState<string | null>(null);
  // const [isProcessingApproval, setIsProcessingApproval] = useState(false);

  // DISABLED: getAwaitingStage and awaitingStage moved to GraphView
  /*
  const getAwaitingStage = (status: string): number | null => {
    if (status === 'pending') return 0;
    const match = status.match(/stage_(\d+)_awaiting_approval/);
    return match ? parseInt(match[1], 10) : null;
  };
  const awaitingStage = state.status ? getAwaitingStage(state.status as string) : null;
  */

  // DISABLED: All handlers below moved to GraphView MissionControlBanner
  /*
  const handleApproveStage = async () => {
    if (awaitingStage === null) return;
    setIsProcessingApproval(true);
    try {
      if (awaitingStage === 0) {
        await startGeneration(courseId);
        showToast('success', 'Генерация запущена!');
      } else {
        await approveStage(courseId, awaitingStage);
        showToast('success', `Stage ${awaitingStage} approved. Launching next phase...`);
      }
    } catch (error) {
      showToast('error', awaitingStage === 0 ? 'Failed to start generation' : 'Failed to approve stage');
      console.error(error);
    } finally {
      setIsProcessingApproval(false);
    }
  };

  const handleCancelGeneration = async () => {
    if (!confirm('Are you sure you want to abort the mission? This cannot be undone.')) return;
    setIsProcessingApproval(true);
    try {
      await cancelGeneration(courseId);
      showToast('info', 'Mission aborted.');
    } catch (_error) {
      showToast('error', 'Failed to cancel generation');
    } finally {
      setIsProcessingApproval(false);
    }
  };
  */

  // Initialize Supabase client on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSupabase(createClient());
    }
  }, []);

  // Save state to session storage
  const saveStateToStorage = useCallback(() => {
    if (typeof window !== 'undefined') {
      const stateToSave = {
        ...state,
        stepRetryCount: Array.from(state.stepRetryCount.entries()),
      };
      sessionStorage.setItem(STORAGE_KEY_STATE(courseId), JSON.stringify(stateToSave));
      sessionStorage.setItem(STORAGE_KEY_TIMESTAMP(courseId), new Date().toISOString());
    }
  }, [state, courseId]);

  // Save state on changes
  useEffect(() => {
    saveStateToStorage();
  }, [state.progress, state.status, state.error, saveStateToStorage]);

  // Show toast helper
  const showToast = useCallback((type: 'success' | 'error' | 'warning' | 'info', message: string) => {
    dispatch({ type: 'SHOW_TOAST', payload: { type, message } });

    // Auto-hide toast after 5 seconds
    if (toastTimeout.current) {
      clearTimeout(toastTimeout.current);
    }
    toastTimeout.current = setTimeout(() => {
      dispatch({ type: 'CLEAR_TOAST' });
    }, 5000);
  }, []);

  // Calculate estimated time based on progress
  const calculateEstimatedTime = useCallback((progress: GenerationProgress) => {
    const avgStepTime = 30;
    const remainingSteps = progress.total_steps - progress.current_step;
    return Math.max(10, remainingSteps * avgStepTime);
  }, []);

  // Handle email notification request
  const handleEmailNotification = useCallback(async () => {
    try {
      // This would call an API to set up email notification
      dispatch({ type: 'SET_EMAIL_NOTIFICATION', payload: true });
      showToast('success', 'You will receive an email when your course is ready');

      // Store notification preference
      if (typeof window !== 'undefined') {
        localStorage.setItem(`email-notification-${courseId}`, 'true');
      }
    } catch {
      showToast('error', 'Failed to set up email notification');
    }
  }, [courseId, showToast]);

  // Check for long-running generation
  useEffect(() => {
    if (state.status !== 'completed' && state.status !== 'failed' && state.status !== 'cancelled') {
      longRunningTimeout.current = setTimeout(() => {
        dispatch({ type: 'SET_LONG_RUNNING', payload: true });
        showToast('info', 'Your course is taking longer than expected, but we\'re still working on it!');
      }, 5 * 60 * 1000); // 5 minutes
    }

    return () => {
      if (longRunningTimeout.current) {
        clearTimeout(longRunningTimeout.current);
      }
    };
  }, [state.status, showToast]);

  // Handle progress update from database
  const handleProgressUpdate = useCallback((course: { generation_progress?: unknown; status?: string | null; generation_status?: string | null; error_message?: string | null; analysis_result?: unknown }) => {
    if (course.generation_progress && typeof course.generation_progress === 'object') {
      const progress = course.generation_progress as {
        steps?: unknown;
        message?: unknown;
        percentage?: unknown;
        current_step?: unknown;
        total_steps?: unknown;
        has_documents?: unknown;
        lessons_completed?: unknown;
        lessons_total?: unknown;
        modules_total?: unknown;
        started_at?: unknown;
        current_stage?: unknown;
        document_size?: unknown;
        estimated_completion?: unknown;
      };

      // Extract modules_total and lessons_total from analysis_result if available (Stage 4+)
      // Priority: 1) analysis_result (most accurate), 2) generation_progress, 3) last known values from ref
      let modulesTotal: number | undefined = (progress.modules_total as number) || undefined;
      let lessonsTotal: number = (progress.lessons_total as number) || lastKnownLessonsTotal.current;

      if (course.analysis_result && typeof course.analysis_result === 'object') {
        const analysisResult = course.analysis_result as {
          recommended_structure?: {
            total_sections?: number;
            total_lessons?: number;
          };
        };
        if (analysisResult.recommended_structure) {
          if (analysisResult.recommended_structure.total_sections) {
            modulesTotal = analysisResult.recommended_structure.total_sections;
          }
          if (analysisResult.recommended_structure.total_lessons) {
            lessonsTotal = analysisResult.recommended_structure.total_lessons;
          }
        }
      }

      // Fallback to last known values if not found in update (realtime may not include analysis_result)
      if (modulesTotal === undefined && lastKnownModulesTotal.current !== undefined) {
        modulesTotal = lastKnownModulesTotal.current;
      }
      if (lessonsTotal === DEFAULT_LESSONS_COUNT && lastKnownLessonsTotal.current > DEFAULT_LESSONS_COUNT) {
        // Only use last known if current is default and we have a better value
        lessonsTotal = lastKnownLessonsTotal.current;
      }

      // Update refs with new values for future updates
      if (modulesTotal !== undefined) {
        lastKnownModulesTotal.current = modulesTotal;
      }
      if (lessonsTotal > DEFAULT_LESSONS_COUNT) {
        lastKnownLessonsTotal.current = lessonsTotal;
      }

      const generationProgress: GenerationProgress = {
        steps: (progress.steps as GenerationStep[]) || [],
        message: (progress.message as string) || 'Processing...',
        percentage: (progress.percentage as number) || 0,
        current_step: (progress.current_step as number) || 0,
        total_steps: (progress.total_steps as number) || 6,
        has_documents: progress.has_documents !== undefined ? (progress.has_documents as boolean) : false,
        lessons_completed: (progress.lessons_completed as number) || 0,
        lessons_total: lessonsTotal,
        modules_total: modulesTotal,
        started_at: progress.started_at ? new Date(progress.started_at as string | number) : new Date(),
        current_stage: (progress.current_stage as string) || null,
        document_size: (progress.document_size as number) || null,
        estimated_completion: progress.estimated_completion ? new Date(progress.estimated_completion as string | number) : undefined,
      };

      dispatch({ type: 'UPDATE_PROGRESS', payload: generationProgress });
      const estimatedTime = calculateEstimatedTime(generationProgress);
      dispatch({ type: 'UPDATE_ESTIMATE', payload: estimatedTime });

      // Check for failed steps
      const failedStep = generationProgress.steps.find(s => s.status === 'failed');
      if (failedStep) {
        showToast('error', `Step failed: ${failedStep.name}. You can retry it.`);
      }
    }

    if (course.generation_status && course.generation_status !== state.status) {
      dispatch({ type: 'SET_STATUS', payload: course.generation_status as CourseStatus });

      // Handle completion
      if (course.generation_status === 'completed') {
        dispatch({
          type: 'ADD_ACTIVITY',
          payload: {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            type: 'success',
            message: 'Course generation completed successfully!',
          }
        });

        // Clear session storage
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(STORAGE_KEY_STATE(courseId));
          sessionStorage.removeItem(STORAGE_KEY_TIMESTAMP(courseId));
        }

        // Trigger confetti celebration
        if (!hasTriggeredConfetti.current) {
          hasTriggeredConfetti.current = true;
          setShowSuccess(true);
          triggerConfetti();
          showToast('success', 'Course generated successfully!');
        }

        if (onComplete) {
          onComplete(courseId);
        }

        if (autoRedirect) {
          redirectTimeout.current = setTimeout(() => {
            router.push(`/courses/${slug}`);
          }, redirectDelay);
        }
      }

      // Handle failure
      if (course.generation_status === 'failed') {
        const error = new Error(course.error_message || 'Course generation failed');
        dispatch({ type: 'SET_ERROR', payload: error });
        showToast('error', 'Course generation failed. Please check the error details.');

        if (onError) {
          onError(error);
        }
      }
    }
  }, [state.status, courseId, slug, router, autoRedirect, redirectDelay, onComplete, onError, calculateEstimatedTime, showToast]);

  // Enhanced polling with exponential backoff
  const startPolling = useCallback(() => {
    const poll = async () => {
      if (!supabase) return; // Wait for supabase to be initialized

      try {
        const { data, error } = await supabase
          .from('courses')
          .select('*')
          .eq('id', courseId)
          .single();

        if (!error && data) {
          handleProgressUpdate(data);
          reconnectAttempts.current = 0; // Reset on success
        } else if (error) {
          // Polling error - will be handled by error state
          reconnectAttempts.current++;

          if (reconnectAttempts.current >= maxReconnectAttempts) {
            showToast('warning', 'Connection issues detected. Retrying...');
          }
        }
      } catch {
        // Polling error - will be handled by error state
        reconnectAttempts.current++;
      }
    };

    // Use exponential backoff for polling interval
    const baseInterval = 3000;
    const interval = Math.min(baseInterval * Math.pow(2, reconnectAttempts.current), 30000);
    pollingInterval.current = setInterval(poll, interval);
  }, [courseId, supabase, handleProgressUpdate, showToast]);

  const stopPolling = useCallback(() => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
  }, []);

  // Set up real-time subscription with reconnection logic
  useEffect(() => {
    if (!supabase) return; // Wait for supabase to be initialized

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let reconnectTimeout: NodeJS.Timeout | undefined;

    const setupSubscription = async () => {
      try {
        channel = supabase
          .channel(`course-progress-${courseId}`)
          .on(
            'postgres_changes',
            {
              event: '*', 
              schema: 'public',
              table: 'courses',
              filter: `id=eq.${courseId}`,
            },
            (payload) => {
              if (payload.new) {
                handleProgressUpdate(payload.new);
              }
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              dispatch({ type: 'SET_CONNECTED', payload: true });
              stopPolling();
              reconnectAttempts.current = 0;
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              dispatch({ type: 'SET_CONNECTED', payload: false });
              startPolling();

              // Try to reconnect after delay
              reconnectTimeout = setTimeout(() => {
                if (channel && supabase) {
                  supabase.removeChannel(channel);
                }
                setupSubscription();
              }, 5000);
            }
          });
      } catch {
        // Subscription error - will be handled by error state
        dispatch({ type: 'SET_CONNECTED', payload: false });
        startPolling();
      }
    };

    setupSubscription();
    startPolling(); // Initial fallback

    return () => {
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
      stopPolling();
      if (redirectTimeout.current) {
        clearTimeout(redirectTimeout.current);
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [courseId, supabase, handleProgressUpdate, startPolling, stopPolling]);


  // Track confetti interval
  const confettiInterval = useRef<NodeJS.Timeout | null>(null);

  // Cleanup confetti on unmount
  useEffect(() => {
    return () => {
      if (confettiInterval.current) {
        clearInterval(confettiInterval.current);
      }
    };
  }, []);

  // Confetti celebration animation
  const triggerConfetti = () => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    // Clear any existing interval first
    if (confettiInterval.current) {
      clearInterval(confettiInterval.current);
    }

    confettiInterval.current = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        if (confettiInterval.current) {
          clearInterval(confettiInterval.current);
          confettiInterval.current = null;
        }
        return;
      }

      const particleCount = 50 * (timeLeft / duration);

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981'],
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981'],
      });
    }, 250);
  };

  return (
      <SpaceBackground>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-[95%] py-8">
          {/* Toast notifications */}
          <AnimatePresence>
            {state.toast && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="fixed top-4 right-4 z-50"
              >
                <Alert
                  variant={state.toast.type === 'error' ? 'destructive' : 'default'}
                  className={`
                    ${state.toast.type === 'success' ? 'border-green-500 bg-green-50 dark:bg-green-950/30' : ''}
                    ${state.toast.type === 'warning' ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30' : ''}
                    ${state.toast.type === 'info' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : ''}
                    shadow-lg
                  `}
                >
                  <AlertDescription className="pr-8">
                    {state.toast.message}
                  </AlertDescription>
                  <button
                    onClick={() => dispatch({ type: 'CLEAR_TOAST' })}
                    className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </Alert>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <CelestialHeader
              courseTitle={courseTitle}
              overallProgress={state.progress.percentage}
              isConnected={state.isConnected}
              currentStage={state.progress.current_stage || null}
            />
          </motion.div>

          {/* Stage Approval Banner - DISABLED: Now rendered inside GraphView for proper selectNode integration */}
          {/* {awaitingStage !== null && (
            <MissionControlBanner
              courseId={courseId}
              awaitingStage={awaitingStage}
              onApprove={handleApproveStage}
              onCancel={handleCancelGeneration}
              onViewResults={() => setDetailsStageId('stage_' + awaitingStage)}
              isProcessing={isProcessingApproval}
              isDark={isDark}
            />
          )} */}

          {/* Long-running generation notice */}
          {state.isLongRunning && !state.emailNotificationRequested && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 max-w-4xl mx-auto"
            >
              <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/30">
                <Clock className="h-4 w-4 text-orange-600" />
                <AlertDescription className="flex items-center justify-between">
                  <span className="text-sm">
                    Your course is taking longer than expected, but we&apos;re still working on it!
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleEmailNotification}
                    className="ml-4"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Notify me by email
                  </Button>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          <motion.div
            className="mt-8 space-y-6"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
          >
            {/* Stats Grid */}
            <StatsGrid 
              progress={state.progress}
              status={state.status}
            />

            {/* Celestial Journey - REPLACED by GraphView */}
            <div className="h-[700px] w-full border rounded-xl overflow-hidden shadow-xl bg-slate-50 relative z-0">
              <GraphViewWrapper courseId={courseId} courseTitle={courseTitle} hasDocuments={state.progress?.has_documents} failedAtStage={failedAtStage} progressPercentage={state.progress?.percentage} generationCode={generationCode} />
            </div>

            {showDebugInfo && (
              <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg max-w-4xl mx-auto">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                  Debug Info
                </h3>
                <pre className="text-xs text-gray-500 dark:text-gray-500 overflow-auto">
                  {JSON.stringify({
                    courseId,
                    status: state.status,
                    progress: state.progress.percentage,
                    isConnected: state.isConnected,
                    retryAttempts: state.retryAttempts,
                    activeTab: state.activeTab,
                    activityCount: state.activityLog.length,
                    isLongRunning: state.isLongRunning,
                    emailNotification: state.emailNotificationRequested,
                    stepRetries: Array.from(state.stepRetryCount.entries()),
                  }, null, 2)}
                </pre>
              </div>
            )}

          </motion.div>
        </div>


        {/* Success Overlay Animation */}
        <AnimatePresence>
          {showSuccess && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="fixed inset-0 flex items-center justify-center pointer-events-none z-50"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 10 }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"
                >
                  <svg
                    className="w-12 h-12 text-green-500 checkmark-animation"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </motion.div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Course Generated!
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Your course is ready. Redirecting...
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* StageResultsDrawer DISABLED: Replaced by NodeDetailsDrawer in GraphView for consistency */}
        {/* <StageResultsDrawer
          isOpen={!!detailsStageId}
          onClose={() => setDetailsStageId(null)}
          courseId={courseId}
          stageNumber={detailsStageId && detailsStageId.startsWith('stage_') ? parseInt(detailsStageId.replace('stage_', ''), 10) : null}
          activityLog={state.activityLog}
        /> */}

      </SpaceBackground>
  );
}
