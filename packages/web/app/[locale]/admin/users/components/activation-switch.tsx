'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { toggleUserActivationAction } from '@/app/actions/admin-users';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';

interface ActivationSwitchProps {
  userId: string;
  isActive: boolean;
  disabled?: boolean;
  onToggled?: () => void;
}

export function ActivationSwitch({ userId, isActive, disabled, onToggled }: ActivationSwitchProps) {
  const t = useTranslations('admin.users');
  const [active, setActive] = useState(isActive);
  const [toggling, setToggling] = useState(false);

  const handleToggle = async (checked: boolean) => {
    setToggling(true);
    try {
      await toggleUserActivationAction({
        userId,
        isActive: checked,
      });

      setActive(checked);
      toast.success(checked ? t('success.userActivated') : t('success.userDeactivated'));
      onToggled?.();
    } catch (error) {
      console.error('Failed to toggle activation:', error);
      toast.error(error instanceof Error ? error.message : t('errors.activationFailed'));
      setActive(isActive); // Revert on error
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Switch
        id={`activation-${userId}`}
        checked={active}
        onCheckedChange={handleToggle}
        disabled={disabled || toggling}
        aria-label={t('actions.toggleActivation')}
      />
      <Label
        htmlFor={`activation-${userId}`}
        className="text-xs text-muted-foreground cursor-pointer"
      >
        {disabled ? t('status.you') : ''}
      </Label>
    </div>
  );
}
