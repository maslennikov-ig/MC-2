'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { trpc } from '@/lib/trpc/react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import type { Role } from '@megacampus/shared-types'

type UserRole = Role

interface DeleteButtonProps {
  userId: string
  userEmail: string
  userRole: UserRole
  currentUserRole: UserRole
  isCurrentUser: boolean
  onDeleted?: () => void
}

export function DeleteButton({
  userId,
  userEmail,
  userRole,
  currentUserRole,
  isCurrentUser,
  onDeleted,
}: DeleteButtonProps) {
  const t = useTranslations('admin.users')
  const [open, setOpen] = useState(false)

  const utils = trpc.useUtils()
  const deleteMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      toast.success(t('success.userDeleted'))
      setOpen(false)
      void utils.admin.listUsers.invalidate()
      onDeleted?.()
    },
    onError: (error) => {
      console.error('Failed to delete user:', error)
      toast.error(error.message || t('errors.deleteFailed'))
    },
  })

  const isSuperadmin = currentUserRole === 'superadmin'
  const isAdmin = currentUserRole === 'admin' || isSuperadmin

  // Admins can delete students and instructors
  // Superadmins can delete anyone (except themselves and last superadmin)
  // Cannot delete yourself
  const canAdminDelete =
    isAdmin && !isCurrentUser && (userRole === 'student' || userRole === 'instructor')
  const canSuperadminDelete = isSuperadmin && !isCurrentUser
  const canDelete = canSuperadminDelete || canAdminDelete

  if (!canDelete) {
    return null
  }

  const handleDelete = () => {
    deleteMutation.mutate({ userId })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
          aria-label={t('actions.delete')}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteDialog.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('deleteDialog.description', { email: userEmail })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>
            {t('deleteDialog.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteMutation.isPending ? t('deleteDialog.deleting') : t('deleteDialog.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
