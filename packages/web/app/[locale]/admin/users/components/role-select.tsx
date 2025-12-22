'use client';

import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateUserRoleAction } from '@/app/actions/admin-users';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { UserRole } from '@/app/actions/admin-users';

interface RoleSelectProps {
  userId: string;
  currentRole: UserRole;
  currentUserRole: UserRole;
  onRoleUpdated?: () => void;
}

export function RoleSelect({ userId, currentRole, currentUserRole, onRoleUpdated }: RoleSelectProps) {
  const t = useTranslations('admin.users');
  const [role, setRole] = useState<UserRole>(currentRole);
  const [updating, setUpdating] = useState(false);

  const isSuperadmin = currentUserRole === 'superadmin';

  const handleRoleChange = async (newRole: string) => {
    // Only superadmins can assign superadmin role
    if (newRole === 'superadmin' && !isSuperadmin) {
      toast.error(t('errors.cannotAssignSuperadmin'));
      return;
    }

    if (newRole === currentRole) return;

    setUpdating(true);
    try {
      await updateUserRoleAction({
        userId,
        role: newRole as UserRole,
      });

      setRole(newRole as UserRole);
      toast.success(t('success.roleUpdated'));
      onRoleUpdated?.();
    } catch (error) {
      console.error('Failed to update role:', error);
      toast.error(error instanceof Error ? error.message : t('errors.roleUpdateFailed'));
      setRole(currentRole); // Revert on error
    } finally {
      setUpdating(false);
    }
  };

  // Non-superadmins cannot modify superadmin users at all
  if (currentRole === 'superadmin' && !isSuperadmin) {
    return (
      <Select value={role} disabled>
        <SelectTrigger className="w-[130px]" aria-label={t('actions.changeRole')}>
          <SelectValue />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select
      value={role}
      onValueChange={handleRoleChange}
      disabled={updating}
    >
      <SelectTrigger className="w-[130px]" aria-label={t('actions.changeRole')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="student">{t('roles.student')}</SelectItem>
        <SelectItem value="instructor">{t('roles.instructor')}</SelectItem>
        <SelectItem value="admin">{t('roles.admin')}</SelectItem>
        {isSuperadmin && (
          <SelectItem value="superadmin">{t('roles.superadmin')}</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
