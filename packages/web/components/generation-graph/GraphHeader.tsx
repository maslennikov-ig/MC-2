import React, { useState, useCallback } from 'react';
import { ArrowLeft, Shield, Sun, Moon, Maximize, Minimize, Hash, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Link from 'next/link';
import { StatsBar } from './StatsBar';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

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
}

export const GraphHeader = ({ title, progress, isAdmin, onOpenAdminPanel, isDark, isFullscreen, onToggleFullscreen, generationCode }: GraphHeaderProps) => {
    const { setTheme } = useTheme();
    const [copied, setCopied] = useState(false);

    const handleCopyCode = useCallback(() => {
        if (!generationCode) return;
        navigator.clipboard.writeText(generationCode);
        setCopied(true);
        toast.success('Код генерации скопирован');
        setTimeout(() => setCopied(false), 2000);
    }, [generationCode]);

    return (
        <div className={`px-4 py-3 flex items-center justify-between shadow-sm relative z-20 border-b ${
            isDark
                ? 'bg-slate-800 border-slate-700'
                : 'bg-white border-slate-200'
        }`}>
            <div className="flex items-center gap-4">
                <Link href="/courses">
                    <Button
                        variant="ghost"
                        size="icon"
                        className={isDark ? 'text-slate-400 hover:text-slate-100' : 'text-slate-500 hover:text-slate-900'}
                    >
                        <ArrowLeft size={20} />
                    </Button>
                </Link>
                <div>
                    <h1 className={`text-base font-bold flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                        {title}
                        <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${
                            isDark
                                ? 'text-slate-300 bg-slate-700'
                                : 'text-slate-400 bg-slate-100'
                        }`}>
                             {Math.round(progress)}%
                        </span>
                    </h1>
                </div>
            </div>
            <div className="flex items-center gap-2">
                {/* Generation Code */}
                {generationCode && (
                    <TooltipProvider delayDuration={200}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleCopyCode}
                                    className={`${isDark ? 'text-slate-400 hover:text-cyan-400' : 'text-slate-500 hover:text-cyan-600'} transition-colors`}
                                >
                                    {copied ? <Check size={18} className="text-green-500" /> : <Hash size={18} />}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="flex flex-col items-center gap-1">
                                <span className="font-mono font-semibold">{generationCode}</span>
                                <span className="text-xs opacity-70">Нажмите для копирования</span>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
                <StatsBar progress={progress} isDark={isDark} />
                {/* Fullscreen Toggle */}
                {onToggleFullscreen && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onToggleFullscreen}
                        className={isDark ? 'text-slate-400 hover:text-blue-400' : 'text-slate-500 hover:text-blue-600'}
                        title={isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
                    >
                        {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                    </Button>
                )}
                {/* Theme Toggle */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setTheme(isDark ? 'light' : 'dark')}
                    className={isDark ? 'text-slate-400 hover:text-yellow-400' : 'text-slate-500 hover:text-slate-900'}
                    title={isDark ? 'Светлая тема' : 'Тёмная тема'}
                >
                    {isDark ? <Sun size={18} /> : <Moon size={18} />}
                </Button>
                {isAdmin && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onOpenAdminPanel}
                        className={isDark ? 'text-slate-400 hover:text-purple-400' : 'text-slate-500 hover:text-purple-600'}
                        title="Панель администратора"
                    >
                        <Shield size={16} />
                    </Button>
                )}
            </div>
        </div>
    );
};
