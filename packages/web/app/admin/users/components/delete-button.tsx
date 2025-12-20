'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
} from '@/components/ui/alert-dialog';
import { deleteUserAction } from '@/app/actions/admin-users';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { UserRole } from '@/app/actions/admin-users';

interface DeleteButtonProps {
  userId: string;
  userEmail: string;
  userRole: UserRole;
  currentUserRole: UserRole;
  isCurrentUser: boolean;
  onDeleted?: () => void;
}

export function DeleteButton({
  userId,
  userEmail,
  userRole,
  currentUserRole,
  isCurrentUser,
  onDeleted,
}: DeleteButtonProps) {
  const t = useTranslations('admin.users');
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState(false);

  const isSuperadmin = currentUserRole === 'superadmin';

  // Only superadmins can delete users
  // Cannot delete yourself
  // Non-superadmins cannot delete superadmin users
  const canDelete = isSuperadmin && !isCurrentUser;
  const cannotDeleteSuperadmin = userRole === 'superadmin' && !isSuperadmin;

  if (!canDelete || cannotDeleteSuperadmin) {
    return null;
  }

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteUserAction({ userId });
      toast.success(t('success.userDeleted'));
      setOpen(false);
      onDeleted?.();
    } catch (error) {
      console.error('Failed to delete user:', error);
      toast.error(error instanceof Error ? error.message : t('errors.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
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
          <AlertDialogCancel disabled={deleting}>
            {t('deleteDialog.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? t('deleteDialog.deleting') : t('deleteDialog.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
