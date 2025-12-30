'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { OrganizationWithMembership, OrgRole, OrganizationMemberWithUser } from '@megacampus/shared-types';

interface OrganizationSettingsFormProps {
  organizationId: string;
}

export function OrganizationSettingsForm({ organizationId }: OrganizationSettingsFormProps) {
  const t = useTranslations('organizations.settings');
  const tRoles = useTranslations('organizations.roles');
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [organization, setOrganization] = useState<OrganizationWithMembership | null>(null);
  const [members, setMembers] = useState<OrganizationMemberWithUser[]>([]);
  const [userRole, setUserRole] = useState<OrgRole | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [allowJoinRequests, setAllowJoinRequests] = useState(false);
  const [defaultMemberRole, setDefaultMemberRole] = useState<OrgRole>('student');
  const [requireEmailDomain, setRequireEmailDomain] = useState('');
  const [maxMembers, setMaxMembers] = useState('');

  // Dialog state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string>('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchOrganization = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/organizations/${organizationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch organization');
      }
      const data = await response.json();
      setOrganization(data);
      setUserRole(data.memberRole || null);

      // Initialize form with current values
      setName(data.name || '');
      setSlug(data.slug || '');
      setAllowJoinRequests(data.settings?.allowJoinRequests || false);
      setDefaultMemberRole(data.settings?.defaultMemberRole || 'student');
      setRequireEmailDomain(data.settings?.requireEmailDomain || '');
      setMaxMembers(data.settings?.maxMembers?.toString() || '');
    } catch (error) {
      console.error('Failed to fetch organization:', error);
      toast.error(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [organizationId, t]);

  const fetchMembers = useCallback(async () => {
    try {
      const response = await fetch(`/api/organizations/${organizationId}/members`);
      if (!response.ok) {
        throw new Error('Failed to fetch members');
      }
      const data = await response.json();
      setMembers(data);
    } catch (error) {
      console.error('Failed to fetch members:', error);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchOrganization();
    fetchMembers();
  }, [fetchOrganization, fetchMembers]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/organizations/${organizationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          settings: {
            allowJoinRequests,
            defaultMemberRole,
            requireEmailDomain: requireEmailDomain || null,
            maxMembers: maxMembers ? parseInt(maxMembers, 10) : null,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update organization');
      }

      toast.success(t('success.updated'));
      fetchOrganization();
    } catch (error) {
      console.error('Failed to update organization:', error);
      toast.error(t('errors.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleTransferOwnership = async () => {
    if (!selectedMember) return;

    setActionLoading(true);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOwnerId: selectedMember }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to transfer ownership');
      }

      toast.success(t('success.ownershipTransferred'));
      setTransferDialogOpen(false);
      fetchOrganization();
    } catch (error) {
      console.error('Failed to transfer ownership:', error);
      toast.error(t('errors.transferFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmation !== organization?.name) return;

    setActionLoading(true);
    try {
      const response = await fetch(`/api/organizations/${organizationId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete organization');
      }

      toast.success(t('success.deleted'));
      router.push('/dashboard');
    } catch (error) {
      console.error('Failed to delete organization:', error);
      toast.error(t('errors.deleteFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const isOwnerOrAdmin = userRole === 'owner' || userRole === 'manager';
  const isOwner = userRole === 'owner';
  const adminMembers = members.filter((m) => m.role === 'manager');
  const roles: OrgRole[] = ['manager', 'instructor', 'student'];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!organization || !isOwnerOrAdmin) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">
          You do not have permission to view these settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t('general.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('general.name.label')}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('general.name.placeholder')}
            />
            <p className="text-xs text-muted-foreground">{t('general.name.hint')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">{t('general.slug.label')}</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('general.slug.prefix')}</span>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder={t('general.slug.placeholder')}
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('general.slug.hint')}</p>
          </div>
        </CardContent>
      </Card>

      {/* Membership Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t('membership.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="allowJoinRequests">{t('membership.allowJoinRequests.label')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('membership.allowJoinRequests.description')}
              </p>
            </div>
            <Switch
              id="allowJoinRequests"
              checked={allowJoinRequests}
              onCheckedChange={setAllowJoinRequests}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultMemberRole">{t('membership.defaultRole.label')}</Label>
            <Select value={defaultMemberRole} onValueChange={(v) => setDefaultMemberRole(v as OrgRole)}>
              <SelectTrigger id="defaultMemberRole" className="w-[200px]">
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
            <p className="text-xs text-muted-foreground">{t('membership.defaultRole.description')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="requireEmailDomain">{t('membership.requireEmailDomain.label')}</Label>
            <Input
              id="requireEmailDomain"
              value={requireEmailDomain}
              onChange={(e) => setRequireEmailDomain(e.target.value)}
              placeholder={t('membership.requireEmailDomain.placeholder')}
            />
            <p className="text-xs text-muted-foreground">
              {t('membership.requireEmailDomain.description')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxMembers">{t('membership.maxMembers.label')}</Label>
            <Input
              id="maxMembers"
              type="number"
              min="1"
              value={maxMembers}
              onChange={(e) => setMaxMembers(e.target.value)}
              placeholder={t('membership.maxMembers.placeholder')}
              className="w-[200px]"
            />
            <p className="text-xs text-muted-foreground">{t('membership.maxMembers.description')}</p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          {t('actions.cancel')}
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('actions.saving')}
            </>
          ) : (
            t('actions.save')
          )}
        </Button>
      </div>

      {/* Danger Zone - Owner only */}
      {isOwner && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              {t('dangerZone.title')}
            </CardTitle>
            <CardDescription>{t('dangerZone.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Transfer Ownership */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-medium">{t('dangerZone.transferOwnership.title')}</h4>
                <p className="text-sm text-muted-foreground">
                  {t('dangerZone.transferOwnership.description')}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setTransferDialogOpen(true)}
                disabled={adminMembers.length === 0}
              >
                {t('dangerZone.transferOwnership.button')}
              </Button>
            </div>

            {/* Delete Organization */}
            <div className="flex items-center justify-between p-4 border border-destructive rounded-lg">
              <div>
                <h4 className="font-medium text-destructive">
                  {t('dangerZone.deleteOrganization.title')}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {t('dangerZone.deleteOrganization.description')}
                </p>
              </div>
              <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                {t('dangerZone.deleteOrganization.button')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transfer Ownership Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dangerZone.transferOwnership.dialog.title')}</DialogTitle>
            <DialogDescription>
              {t('dangerZone.transferOwnership.dialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('dangerZone.transferOwnership.dialog.selectMember')}</Label>
              <Select value={selectedMember} onValueChange={setSelectedMember}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {adminMembers.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      {member.user.fullName || member.user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
              {t('dangerZone.transferOwnership.dialog.cancel')}
            </Button>
            <Button onClick={handleTransferOwnership} disabled={!selectedMember || actionLoading}>
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('dangerZone.transferOwnership.dialog.transferring')}
                </>
              ) : (
                t('dangerZone.transferOwnership.dialog.confirm')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Organization Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {t('dangerZone.deleteOrganization.dialog.title')}
            </DialogTitle>
            <DialogDescription>
              {t('dangerZone.deleteOrganization.dialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('dangerZone.deleteOrganization.dialog.confirmLabel', { name: organization.name })}</Label>
              <Input
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder={t('dangerZone.deleteOrganization.dialog.confirmPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t('dangerZone.deleteOrganization.dialog.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteConfirmation !== organization.name || actionLoading}
            >
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('dangerZone.deleteOrganization.dialog.deleting')}
                </>
              ) : (
                t('dangerZone.deleteOrganization.dialog.confirm')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
