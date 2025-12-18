import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useTranslation } from '@/lib/generation-graph/useTranslation';

export const ConnectionStatus = ({ isConnected }: { isConnected: boolean }) => {
    const { t } = useTranslation();
    
    if (isConnected) {
        return (
            <div className="flex items-center gap-2 px-2 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-medium border border-emerald-100 shadow-sm opacity-75 hover:opacity-100 transition-opacity">
                <Wifi size={12} />
                Connected
            </div>
        );
    }
    
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-xs font-medium border border-red-200 shadow-sm animate-pulse">
            <WifiOff size={14} />
            {t('errors.connectionLost') || 'Connection Lost'}
        </div>
    );
};
