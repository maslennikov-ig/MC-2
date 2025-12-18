'use client';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ActionButtonWithTooltipProps {
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  variant?: 'ghost' | 'outline' | 'default' | 'destructive' | 'secondary' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  isActive?: boolean;
}

export function ActionButtonWithTooltip({
  icon,
  label,
  onClick,
  disabled = false,
  variant = 'ghost',
  size = 'icon',
  className = '',
  isActive = false,
}: ActionButtonWithTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={cn(
            'transition-colors',
            isActive && 'text-purple-400',
            className
          )}
          onClick={(e) => {
            e.stopPropagation();
            onClick(e);
          }}
          disabled={disabled}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}