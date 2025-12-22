'use client';

import { useEffect, useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, Search, ChevronLeft, ChevronRight, Mail, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { listUsersAction, getCurrentUserRoleAction } from '@/app/actions/admin-users';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { RoleBadge } from '@/components/common/role-badge';
import { RoleSelect } from './role-select';
import { ActivationSwitch } from './activation-switch';
import { DeleteButton } from './delete-button';
import { useTranslations } from 'next-intl';
import { createBrowserClient } from '@supabase/ssr';
import type { UserListItem, UserRole } from '@/app/actions/admin-users';

/** Debounce timeout for search input in milliseconds */
const SEARCH_DEBOUNCE_MS = 300;

export function UsersTable() {
  const t = useTranslations('admin.users');
  const [data, setData] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null | 'loading'>('loading');
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | 'loading'>('loading');

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    }).catch((err) => {
      console.error('Failed to fetch current user:', err);
      setCurrentUserId(null);
      toast.error('Failed to identify current user. Some actions disabled for safety.');
    });

    // Fetch current user's role
    getCurrentUserRoleAction()
      .then((result) => {
        setCurrentUserRole(result.role);
      })
      .catch((err) => {
        console.error('Failed to fetch current user role:', err);
        setCurrentUserRole('admin'); // Default to admin (safer - less permissions)
      });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listUsersAction({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        search: search || undefined,
        role: roleFilter !== 'all' ? roleFilter : undefined,
        isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
      });

      setData(result.users);
      setTotalCount(result.totalCount);
    } catch (err) {
      console.error('Failed to fetch users', err);
      const errorMessage = err instanceof Error ? err.message : t('errors.loadFailed');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [pageSize, page, search, roleFilter, statusFilter, t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [loadData]);

  const handleRoleUpdate = useCallback(() => {
    loadData();
  }, [loadData]);

  const handleActivationToggle = useCallback(() => {
    loadData();
  }, [loadData]);

  const handleUserDeleted = useCallback(() => {
    loadData();
  }, [loadData]);

  const totalPages = Math.ceil(totalCount / pageSize);

  const getStatusBadge = (isActive: boolean) => {
    if (isActive) {
      return (
        <Badge variant="secondary" className="bg-green-500/10 text-green-500 hover:bg-green-500/20">
          {t('status.active')}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-gray-500/10 text-gray-500 hover:bg-gray-500/20">
        {t('status.inactive')}
      </Badge>
    );
  };

  const isRoleLoaded = currentUserRole !== 'loading';
  const isSuperadmin = currentUserRole === 'superadmin';

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('filters.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label={t('filters.searchPlaceholder')}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[140px]" aria-label={t('filters.roleLabel')}>
              <SelectValue placeholder={t('filters.roleLabel')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allRoles')}</SelectItem>
              <SelectItem value="student">{t('roles.student')}</SelectItem>
              <SelectItem value="instructor">{t('roles.instructor')}</SelectItem>
              <SelectItem value="admin">{t('roles.admin')}</SelectItem>
              <SelectItem value="superadmin">{t('roles.superadmin')}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]" aria-label={t('filters.statusLabel')}>
              <SelectValue placeholder={t('filters.statusLabel')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
              <SelectItem value="active">{t('status.active')}</SelectItem>
              <SelectItem value="inactive">{t('status.inactive')}</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={loadData} disabled={loading} aria-label={t('actions.refresh')}>
             <Loader2 className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card shadow-sm overflow-hidden">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b">
              <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">{t('table.email')}</th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">{t('table.organization')}</th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">{t('table.role')}</th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">{t('table.status')}</th>
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">{t('table.created')}</th>
                <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {loading && data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="h-24 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : error ? (
                 <tr>
                  <td colSpan={6} className="h-24 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="h-24 text-center text-muted-foreground">
                    {t('table.noUsers')}
                  </td>
                </tr>
              ) : (
                data.map((user) => {
                  const isCurrentUser = currentUserId === user.id;
                  return (
                    <tr
                      key={user.id}
                      className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                    >
                      <td className="p-4 align-middle">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{user.email}</span>
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Building2 className="h-4 w-4" />
                          <span>{user.organizationName}</span>
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="p-4 align-middle">
                        {getStatusBadge(user.isActive)}
                      </td>
                      <td className="p-4 align-middle text-muted-foreground">
                        {user.createdAt && formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                      </td>
                      <td className="p-4 align-middle">
                        <div className="flex items-center justify-end gap-3">
                          {isRoleLoaded && (
                            <RoleSelect
                              userId={user.id}
                              currentRole={user.role}
                              currentUserRole={currentUserRole as UserRole}
                              onRoleUpdated={handleRoleUpdate}
                            />
                          )}
                          <ActivationSwitch
                            userId={user.id}
                            isActive={user.isActive}
                            disabled={currentUserId === 'loading' || isCurrentUser}
                            onToggled={handleActivationToggle}
                          />
                          {isRoleLoaded && isSuperadmin && (
                            <DeleteButton
                              userId={user.id}
                              userEmail={user.email}
                              userRole={user.role}
                              currentUserRole={currentUserRole as UserRole}
                              isCurrentUser={isCurrentUser}
                              onDeleted={handleUserDeleted}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-muted-foreground">
          {t('pagination.showing', {
            from: (page - 1) * pageSize + 1,
            to: Math.min(page * pageSize, totalCount),
            total: totalCount
          })}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            aria-label={t('pagination.previous')}
          >
            <ChevronLeft className="h-4 w-4" />
            {t('pagination.previous')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            aria-label={t('pagination.next')}
          >
            {t('pagination.next')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
