import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { useGenerationRealtime } from '@/components/generation-monitoring/realtime-provider';
import { EmailNotificationRequest } from './EmailNotificationRequest';
import { useTranslation } from '@/lib/generation-graph/useTranslation';
import { ACTIVE_STATUSES } from '@/lib/generation-graph/constants';

const LONG_RUNNING_THRESHOLD = 5 * 60 * 1000; // 5 minutes

export const LongRunningIndicator = () => {
    const { status } = useGenerationRealtime();
    const [startTime] = useState(Date.now());
    const [isLongRunning, setIsLongRunning] = useState(false);
    const { t } = useTranslation();

    useEffect(() => {
        if (!status || !ACTIVE_STATUSES.includes(status)) return;

        const interval = setInterval(() => {
            if (Date.now() - startTime > LONG_RUNNING_THRESHOLD) {
                setIsLongRunning(true);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [status, startTime]);

    if (!isLongRunning) return null;

    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-orange-50 border border-orange-200 text-orange-800 px-3 py-2 rounded-full flex items-center gap-3 shadow-md z-50 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 animate-pulse" />
                <span className="text-sm font-medium">{t('longRunning.message')}</span>
            </div>
            <div className="h-4 w-px bg-orange-200" />
            <div className="scale-90 origin-left">
                <EmailNotificationRequest />
            </div>
        </div>
    );
};
