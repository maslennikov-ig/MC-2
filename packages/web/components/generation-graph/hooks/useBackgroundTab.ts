import { useEffect } from 'react';
import { useGenerationRealtime } from '@/components/generation-monitoring/realtime-provider';
import { ACTIVE_STATUSES } from '@/lib/generation-graph/constants';

export const useBackgroundTab = () => {
    const { status } = useGenerationRealtime();

    useEffect(() => {
        if (!status || !ACTIVE_STATUSES.includes(status)) return;

        const handleVisibilityChange = () => {
            if (document.hidden) {
                document.title = 'Generating... | MegaCampus';
            } else {
                document.title = 'Course Generation | MegaCampus';
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            document.title = 'Course Generation | MegaCampus';
        };
    }, [status]);
};
