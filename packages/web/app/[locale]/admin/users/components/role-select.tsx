'use client'

import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { trpc } from '@/lib/trpc/react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import type { Role } from '@megacampus/shared-types'

type UserRole = Role

interface RoleSelectProps {
  userId: string
  currentRole: UserRole
  currentUserRole: UserRole
  onRoleUpdated?: () => void
}

export function RoleSelect({
  userId,
  currentRole,
  currentUserRole,
  onRoleUpdated,
}: RoleSelectProps) {
  const t = useTranslations('admin.users')
  const [role, setRole] = useState<UserRole>(currentRole)

  const utils = trpc.useUtils()
  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success(t('success.roleUpdated'))
      void utils.admin.listUsers.invalidate()
      onRoleUpdated?.()
    },
    onError: (error) => {
      console.error('Failed to update role:', error)
      toast.error(error.message || t('errors.roleUpdateFailed'))
      setRole(currentRole) // Revert on error
    },
  })

  const isSuperadmin = currentUserRole === 'superadmin'

  const handleRoleChange = (newRole: string) => {
    // Only superadmins can assign superadmin role
    if (newRole === 'superadmin' && !isSuperadmin) {
      toast.error(t('errors.cannotAssignSuperadmin'))
      return
    }

    if (newRole === currentRole) return

    setRole(newRole as UserRole)
    updateRoleMutation.mutate({
      userId,
      role: newRole as UserRole,
    })
  }

  // Non-superadmins cannot modify superadmin users at all
  if (currentRole === 'superadmin' && !isSuperadmin) {
    return (
      <Select value={role} disabled>
        <SelectTrigger className="w-[130px]" aria-label={t('actions.changeRole')}>
          <SelectValue />
        </SelectTrigger>
      </Select>
    )
  }

  return (
    <Select
      value={role}
      onValueChange={(value) => void handleRoleChange(value)}
      disabled={updateRoleMutation.isPending}
    >
      <SelectTrigger className="w-[130px]" aria-label={t('actions.changeRole')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="student">{t('roles.student')}</SelectItem>
        <SelectItem value="instructor">{t('roles.instructor')}</SelectItem>
        <SelectItem value="admin">{t('roles.admin')}</SelectItem>
        {isSuperadmin && <SelectItem value="superadmin">{t('roles.superadmin')}</SelectItem>}
      </SelectContent>
    </Select>
  )
}
