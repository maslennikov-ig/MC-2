'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
    ArrowLeft,
    Shield,
    Sun,
    Moon,
    Maximize,
    Minimize,
    Fingerprint,
    Check,
    Rocket,
    ChevronRight,
    ChevronLeft,
    ChevronDown,
    ChevronUp,
    FileText,
    Layers,
    BookOpen,
    Clock,
    CheckCircle2,
    Zap,
    Menu,
} from 'lucide-react';
import { NavigationSheet } from './components/NavigationSheet';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { GenerationProgress, CourseStatus } from '@/types/course-generation';
import { useFullscreenContext } from './contexts/FullscreenContext';
import { STAGE_CONFIG } from '@/components/generation-celestial/utils';

interface GraphHeaderProps {
    title: string;
    progress: number;
    courseId: string;
    isAdmin?: boolean;
    onOpenAdminPanel?: () => void;
    isDark?: boolean;
    isFullscreen?: boolean;
    onToggleFullscreen?: () => void;
    /** Human-readable generation code (e.g., "ABC-1234") for debugging */
    generationCode?: string | null;
    /** Full generation progress data for stats display */
    generationProgress?: GenerationProgress;
    /** Current generation status */
    generationStatus?: CourseStatus;
    /** Whether realtime connection is active */
    isConnected?: boolean;
}

interface CompactStatProps {
    icon?: React.ReactNode;
    value: string;
    tooltip: string;
    className?: string;
    /** Container for tooltip portal (fullscreen support) */
    container?: HTMLElement | null;
}

function CompactStat({ icon, value, tooltip, className, container }: CompactStatProps) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className={cn("flex items-center gap-0.5 text-[10px] tabular-nums whitespace-nowrap cursor-help", className)}>
                    {icon}
                    <span>{value}</span>
                </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px] px-2 py-1" container={container}>
                {tooltip}
            </TooltipContent>
        </Tooltip>
    );
}

function Separator({ isDark }: { isDark?: boolean }) {
    return <span className={isDark ? "text-slate-600 select-none" : "text-slate-300 select-none"}>│</span>;
}

interface MobileStatProps {
    label: string;
    value: string;
    subValue?: string;
    icon?: React.ReactNode;
    isDark?: boolean;
}

function MobileStat({ label, value, subValue, icon, isDark }: MobileStatProps) {
    return (
        <div className={cn(
            "rounded px-1.5 py-1",
            isDark ? "bg-slate-800/50" : "bg-slate-100"
        )}>
            <div className="flex items-center justify-between gap-1">
                <p className="text-[9px] font-medium uppercase tracking-wider opacity-70 truncate">
                    {label}
                </p>
                {icon && <div className="flex-shrink-0">{icon}</div>}
            </div>
            <p className="text-xs font-bold tabular-nums">{value}</p>
            {subValue && (
                <p className="text-[9px] opacity-60 truncate">{subValue}</p>
            )}
        </div>
    );
}

export const GraphHeader = ({
    title,
    progress,
    isAdmin,
    onOpenAdminPanel,
    isDark,
    isFullscreen,
    onToggleFullscreen,
    generationCode,
    generationProgress,
    generationStatus,
    isConnected = true
}: GraphHeaderProps) => {
    const { setTheme } = useTheme();
    const t = useTranslations('generation');
    const [copied, setCopied] = useState(false);
    const [isExpanded, setIsExpanded] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('generation-progress-expanded') === 'true';
        }
        return false;
    });
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { portalContainerRef } = useFullscreenContext();

    // Calculate elapsed time
    const [elapsed, setElapsed] = useState('0s');

    useEffect(() => {
        if (!generationProgress?.started_at) return;

        const start = new Date(generationProgress.started_at);

        const updateTime = () => {
            const now = new Date();
            const diff = Math.floor((now.getTime() - start.getTime()) / 1000);

            if (diff < 60) setElapsed(`${diff}s`);
            else if (diff < 3600) setElapsed(`${Math.floor(diff / 60)}m ${diff % 60}s`);
            else setElapsed(`${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`);
        };

        updateTime();
        const interval = setInterval(updateTime, 1000);
        return () => clearInterval(interval);
    }, [generationProgress?.started_at]);

    // Save expansion state to localStorage
    useEffect(() => {
        localStorage.setItem('generation-progress-expanded', String(isExpanded));
    }, [isExpanded]);

    const handleCopyCode = useCallback(() => {
        if (!generationCode) return;
        navigator.clipboard.writeText(generationCode);
        setCopied(true);
        toast.success('Код генерации скопирован');
        setTimeout(() => setCopied(false), 2000);
    }, [generationCode]);

    // Calculate stats
    const status = generationStatus || 'pending';
    const totalSteps = Object.keys(STAGE_CONFIG).filter(key => key !== 'stage_0').length;
    const currentStep = generationProgress?.current_step ?? 0;
    const displayStep = status === 'completed' ? totalSteps : Math.min(currentStep + 1, totalSteps);

    const showStructureStats = generationProgress && (
        (generationProgress.modules_total !== undefined && generationProgress.modules_total > 0) ||
        (generationProgress.lessons_total > 0 && (
            status === 'generating_structure' ||
            status === 'generating_content' ||
            status === 'completed' ||
            (typeof status === 'string' && (status.includes('stage_4') || status.includes('stage_5') || status.includes('stage_6')))
        ))
    );

    const hasDocuments = generationProgress?.has_documents ?? false;
    const modulesTotal = showStructureStats ? (generationProgress?.modules_total ?? '—') : '—';
    const lessonsCompleted = generationProgress?.lessons_completed ?? 0;
    const lessonsTotal = generationProgress?.lessons_total ?? 0;
    const lessonsPercent = showStructureStats && lessonsTotal > 0
        ? Math.round((lessonsCompleted / lessonsTotal) * 100)
        : 0;

    const hasStats = !!generationProgress;

    return (
        <TooltipProvider delayDuration={200}>
            <div className={cn(
                "shadow-sm relative z-20 border-b overflow-hidden",
                isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
            )}>
                {/* Main row */}
                <motion.div layout className="px-3 py-1.5 flex items-center gap-2">
                    {/* Left section: Back + Title (shrink-0) */}
                    <div className="flex items-center gap-2 shrink-0">
                        <Link href="/courses" className="shrink-0">
                            <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 ${isDark ? 'text-slate-400 hover:text-slate-100' : 'text-slate-500 hover:text-slate-900'}`}
                            >
                                <ArrowLeft size={16} />
                            </Button>
                        </Link>

                        {/* Rocket icon with connection indicator */}
                        <div className="relative flex-shrink-0">
                            <Rocket className={`w-3.5 h-3.5 ${isDark ? 'text-purple-400' : 'text-purple-500'}`} />
                            {!isConnected && (
                                <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                            )}
                        </div>

                        {/* Title */}
                        <span className={cn(
                            "text-xs font-medium truncate max-w-[300px]",
                            isDark ? 'text-slate-100' : 'text-slate-900'
                        )}>
                            {title}
                        </span>
                    </div>

                    {/* Middle section: Progress bar (flex-1 - fills all available space) */}
                    <div className="hidden lg:flex flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all duration-500"
                            style={{ width: `${Math.round(progress)}%` }}
                        />
                    </div>

                    {/* Right section: Stats + Controls (shrink-0) */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        {/* Percentage */}
                        <span className={`text-xs font-bold tabular-nums ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                            {Math.round(progress)}%
                        </span>

                        {/* Desktop inline stats - shown when expanded */}
                        <AnimatePresence>
                            {isExpanded && hasStats && (
                                <motion.div
                                    initial={{ width: 0, opacity: 0 }}
                                    animate={{ width: 'auto', opacity: 1 }}
                                    exit={{ width: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="hidden lg:flex items-center gap-1.5 overflow-hidden"
                                >
                                    <Separator isDark={isDark} />
                                    <CompactStat
                                        icon={<FileText className="w-2.5 h-2.5" />}
                                        value={hasDocuments ? '✓' : '—'}
                                        tooltip={hasDocuments ? t('stats.hasDocuments') : t('stats.noDocuments')}
                                        container={portalContainerRef.current}
                                    />
                                    <Separator isDark={isDark} />
                                    <CompactStat
                                        icon={<Layers className="w-2.5 h-2.5" />}
                                        value={`${modulesTotal} ${t('stats.modulesShort')}`}
                                        tooltip={t('stats.modulesTooltip')}
                                        container={portalContainerRef.current}
                                    />
                                    <Separator isDark={isDark} />
                                    <CompactStat
                                        icon={<BookOpen className="w-2.5 h-2.5" />}
                                        value={`${lessonsCompleted}/${lessonsTotal}`}
                                        tooltip={t('stats.lessonsTooltip')}
                                        className={lessonsPercent > 0 ? "text-purple-600 dark:text-purple-400" : ""}
                                        container={portalContainerRef.current}
                                    />
                                    <Separator isDark={isDark} />
                                    <CompactStat
                                        icon={<Clock className="w-2.5 h-2.5" />}
                                        value={elapsed}
                                        tooltip={t('stats.timeTooltip')}
                                        container={portalContainerRef.current}
                                    />
                                    <Separator isDark={isDark} />
                                    <CompactStat
                                        icon={status === 'completed' ? <CheckCircle2 className="w-2.5 h-2.5 text-green-500" /> : <Zap className="w-2.5 h-2.5" />}
                                        value={`${displayStep}/${totalSteps}`}
                                        tooltip={t('stats.stepsTooltip')}
                                        container={portalContainerRef.current}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Expand button (only if we have stats) */}
                        {hasStats && (
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className={cn(
                                    "p-0.5 rounded transition-colors",
                                    isDark ? "hover:bg-slate-700" : "hover:bg-slate-200"
                                )}
                                aria-label={isExpanded ? 'Collapse' : 'Expand'}
                            >
                                {/* Desktop: horizontal chevrons */}
                                <span className="hidden lg:block">
                                    {isExpanded ? (
                                        <ChevronLeft className={`w-3 h-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`} />
                                    ) : (
                                        <ChevronRight className={`w-3 h-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`} />
                                    )}
                                </span>
                                {/* Mobile/Tablet: vertical chevrons */}
                                <span className="lg:hidden">
                                    {isExpanded ? (
                                        <ChevronUp className={`w-3 h-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`} />
                                    ) : (
                                        <ChevronDown className={`w-3 h-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`} />
                                    )}
                                </span>
                            </button>
                        )}

                        {/* Separator before controls */}
                        <div className={cn("w-px h-4 mx-1", isDark ? "bg-slate-700" : "bg-slate-200")} />
                        {/* Generation Code */}
                        {generationCode && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleCopyCode}
                                        className={`h-6 w-6 ${isDark ? 'text-slate-400 hover:text-cyan-400' : 'text-slate-500 hover:text-cyan-600'} transition-colors`}
                                    >
                                        {copied ? <Check size={14} className="text-green-500" /> : <Fingerprint size={14} />}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="top"
                                    className="flex flex-col items-center gap-1 px-2 py-1.5 bg-slate-900 dark:bg-slate-800 border border-slate-700 shadow-xl"
                                    container={portalContainerRef.current}
                                >
                                    <span className="text-[10px] text-slate-400">Код генерации</span>
                                    <span className="font-mono text-xs font-bold text-cyan-400">{generationCode}</span>
                                    <span className="text-[10px] text-slate-500">Нажмите для копирования</span>
                                </TooltipContent>
                            </Tooltip>
                        )}

                        {/* Fullscreen Toggle */}
                        {onToggleFullscreen && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onToggleFullscreen}
                                className={`h-6 w-6 ${isDark ? 'text-slate-400 hover:text-blue-400' : 'text-slate-500 hover:text-blue-600'}`}
                                title={isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
                            >
                                {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
                            </Button>
                        )}

                        {/* Theme Toggle */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setTheme(isDark ? 'light' : 'dark')}
                            className={`h-6 w-6 ${isDark ? 'text-slate-400 hover:text-yellow-400' : 'text-slate-500 hover:text-slate-900'}`}
                            title={isDark ? 'Светлая тема' : 'Тёмная тема'}
                        >
                            {isDark ? <Sun size={14} /> : <Moon size={14} />}
                        </Button>

                        {isAdmin && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onOpenAdminPanel}
                                className={`h-6 w-6 ${isDark ? 'text-slate-400 hover:text-purple-400' : 'text-slate-500 hover:text-purple-600'}`}
                                title="Панель администратора"
                            >
                                <Shield size={12} />
                            </Button>
                        )}

                        {/* Navigation Menu */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsMenuOpen(true)}
                            className={`h-6 w-6 ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
                            title="Меню"
                            aria-label="Открыть меню навигации"
                        >
                            <Menu size={14} />
                        </Button>
                    </div>
                </motion.div>

                {/* Navigation Sheet */}
                <NavigationSheet
                    isOpen={isMenuOpen}
                    onClose={() => setIsMenuOpen(false)}
                    isDark={isDark}
                    container={portalContainerRef.current}
                />

                {/* Mobile/Tablet progress bar (below title) */}
                <div className="lg:hidden px-3 pb-1.5">
                    <div className={cn(
                        "h-1.5 rounded-full overflow-hidden",
                        isDark ? "bg-slate-700" : "bg-slate-200"
                    )}>
                        <div
                            className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all duration-500"
                            style={{ width: `${Math.round(progress)}%` }}
                        />
                    </div>
                </div>

                {/* Mobile/Tablet expanded stats */}
                <AnimatePresence>
                    {isExpanded && hasStats && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="lg:hidden overflow-hidden"
                        >
                            <div className={cn(
                                "grid grid-cols-3 sm:grid-cols-5 gap-1 px-3 pb-1.5",
                                isDark ? "text-slate-100" : "text-slate-900"
                            )}>
                                <MobileStat
                                    label={t('stats.documents')}
                                    value={hasDocuments ? t('stats.processing') : t('stats.none')}
                                    subValue={generationProgress?.document_size ? `${(generationProgress.document_size / 1000).toFixed(1)}KB` : undefined}
                                    icon={<FileText className="w-2.5 h-2.5 text-blue-500" />}
                                    isDark={isDark}
                                />
                                <MobileStat
                                    label={t('stats.modules')}
                                    value={String(modulesTotal)}
                                    subValue={status === 'generating_structure' || (typeof status === 'string' && status.includes('stage_4_analyzing')) ? t('stats.analyzing') : undefined}
                                    icon={<Layers className="w-2.5 h-2.5 text-purple-500" />}
                                    isDark={isDark}
                                />
                                <MobileStat
                                    label={t('stats.lessons')}
                                    value={showStructureStats ? `${lessonsCompleted}/${lessonsTotal}` : '—'}
                                    subValue={lessonsPercent > 0 ? `${lessonsPercent}%` : undefined}
                                    icon={<BookOpen className="w-2.5 h-2.5 text-purple-500" />}
                                    isDark={isDark}
                                />
                                <MobileStat
                                    label={t('stats.time')}
                                    value={elapsed}
                                    subValue={status === 'completed' ? t('stats.completed') : t('stats.inProgress')}
                                    icon={<Clock className="w-2.5 h-2.5 text-orange-500" />}
                                    isDark={isDark}
                                />
                                <MobileStat
                                    label={t('stats.steps')}
                                    value={`${displayStep}/${totalSteps}`}
                                    subValue={status === 'completed' ? t('stats.allCompleted') : t('stats.step', { number: displayStep })}
                                    icon={status === 'completed' ? <CheckCircle2 className="w-2.5 h-2.5 text-green-500" /> : <Zap className="w-2.5 h-2.5 text-green-500" />}
                                    isDark={isDark}
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </TooltipProvider>
    );
};
