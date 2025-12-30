'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { formatDistanceToNow } from 'date-fns';
import {
  Loader2,
  UserPlus,
  Mail,
  User,
  MoreHorizontal,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { InviteModal } from '@/components/org/invite-modal';
import type {
  OrganizationMemberWithUser,
  OrganizationInvitationWithCreator,
  OrgRole,
} from '@megacampus/shared-types';

interface MembersManagementProps {
  organizationId: string;
}

const PAGE_SIZE = 10;

export function MembersManagement({ organizationId }: MembersManagementProps) {
  const t = useTranslations('organizations.members');
  const tInv = useTranslations('organizations.invitations');
  const tRoles = useTranslations('organizations.roles');

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<OrganizationMemberWithUser[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitationWithCreator[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<OrgRole | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalMembers, setTotalMembers] = useState(0);

  // Modal states
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<OrganizationMemberWithUser | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/organizations/${organizationId}/members?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch members');
      }
      const data = await response.json();
      setMembers(data.members || data);
      setTotalMembers(data.total || data.length);

      // Get current user info from first load
      if (!currentUserId && data.currentUserId) {
        setCurrentUserId(data.currentUserId);
        setCurrentUserRole(data.currentUserRole);
      }
    } catch (error) {
      console.error('Failed to fetch members:', error);
      toast.error(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [organizationId, page, t, currentUserId]);

  const fetchInvitations = useCallback(async () => {
    try {
      const response = await fetch(`/api/organizations/${organizationId}/invitations`);
      if (!response.ok) {
        throw new Error('Failed to fetch invitations');
      }
      const data = await response.json();
      setInvitations(data.filter((inv: OrganizationInvitationWithCreator) => inv.status === 'pending'));
    } catch (error) {
      console.error('Failed to fetch invitations:', error);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchMembers();
    fetchInvitations();
  }, [fetchMembers, fetchInvitations]);

  const handleRoleChange = async (memberId: string, newRole: OrgRole) => {
    try {
      const response = await fetch(`/api/organizations/${organizationId}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update role');
      }

      toast.success(t('success.roleUpdated'));
      fetchMembers();
    } catch (error) {
      console.error('Failed to update role:', error);
      toast.error(t('errors.roleUpdateFailed'));
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;

    setActionLoading(true);
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/members/${memberToRemove.id}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to remove member');
      }

      toast.success(t('success.memberRemoved'));
      setRemoveDialogOpen(false);
      setMemberToRemove(null);
      fetchMembers();
    } catch (error) {
      console.error('Failed to remove member:', error);
      toast.error(t('errors.removeFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/invitations/${invitationId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Failed to revoke invitation');
      }

      toast.success(tInv('success.revoked'));
      fetchInvitations();
    } catch (error) {
      console.error('Failed to revoke invitation:', error);
      toast.error(tInv('errors.revokeFailed'));
    }
  };

  const getRoleBadgeVariant = (role: OrgRole): 'default' | 'secondary' | 'outline' => {
    switch (role) {
      case 'owner':
        return 'default';
      case 'manager':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const canManageMembers = currentUserRole === 'owner' || currentUserRole === 'manager';
  const totalPages = Math.ceil(totalMembers / PAGE_SIZE);
  const roles: OrgRole[] = ['manager', 'instructor', 'student'];

  if (loading && members.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Members Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>
              {totalMembers} member{totalMembers !== 1 ? 's' : ''}
            </CardDescription>
          </div>
          {canManageMembers && (
            <Button onClick={() => setInviteModalOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              {t('actions.invite')}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table.email')}</TableHead>
                <TableHead>{t('table.name')}</TableHead>
                <TableHead>{t('table.role')}</TableHead>
                <TableHead>{t('table.joined')}</TableHead>
                {canManageMembers && <TableHead className="text-right">{t('table.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManageMembers ? 5 : 4} className="h-24 text-center">
                    {t('table.noMembers')}
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => {
                  const isCurrentUser = member.userId === currentUserId;
                  const isOwner = member.role === 'owner';
                  const canChangeRole = canManageMembers && !isOwner && !isCurrentUser;
                  const canRemove = canManageMembers && !isOwner && !isCurrentUser;

                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span>{member.user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {member.user.avatarUrl ? (
                            <img
                              src={member.user.avatarUrl}
                              alt=""
                              className="h-6 w-6 rounded-full"
                            />
                          ) : (
                            <User className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span>{member.user.fullName || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {canChangeRole ? (
                          <Select
                            value={member.role}
                            onValueChange={(value) => handleRoleChange(member.id, value as OrgRole)}
                          >
                            <SelectTrigger className="w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roles.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {tRoles(r)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={getRoleBadgeVariant(member.role)}>
                            {tRoles(member.role)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(member.joinedAt), { addSuffix: true })}
                      </TableCell>
                      {canManageMembers && (
                        <TableCell className="text-right">
                          {canRemove ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => {
                                    setMemberToRemove(member);
                                    setRemoveDialogOpen(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  {t('actions.remove')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations Section */}
      {canManageMembers && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{tInv('title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tInv('table.type')}</TableHead>
                  <TableHead>{tInv('table.recipient')}</TableHead>
                  <TableHead>{tInv('table.role')}</TableHead>
                  <TableHead>{tInv('table.expires')}</TableHead>
                  <TableHead>{tInv('table.uses')}</TableHead>
                  <TableHead className="text-right">{tInv('table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>
                      <Badge variant="outline">{tInv(`tabs.${invitation.invitationType}`)}</Badge>
                    </TableCell>
                    <TableCell>
                      {invitation.invitationType === 'email'
                        ? invitation.email
                        : invitation.invitationType === 'code'
                        ? invitation.code
                        : 'Link'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{tRoles(invitation.role)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDistanceToNow(new Date(invitation.expiresAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      {invitation.maxUses
                        ? `${invitation.currentUses}/${invitation.maxUses}`
                        : invitation.currentUses}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleRevokeInvitation(invitation.id)}
                      >
                        {tInv('actions.revoke')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Invite Modal */}
      <InviteModal
        open={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
        organizationId={organizationId}
        onInviteCreated={() => {
          fetchInvitations();
        }}
      />

      {/* Remove Member Dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('removeDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('removeDialog.description', {
                name: memberToRemove?.user.fullName || memberToRemove?.user.email || '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveDialogOpen(false)}>
              {t('removeDialog.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRemoveMember} disabled={actionLoading}>
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('removeDialog.removing')}
                </>
              ) : (
                t('removeDialog.confirm')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
