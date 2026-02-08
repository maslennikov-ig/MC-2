'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Loader2, Search, ChevronLeft, ChevronRight, Mail, Building2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { keepPreviousData } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc/react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { RoleBadge } from '@/components/common/role-badge'
import { RoleSelect } from './role-select'
import { ActivationSwitch } from './activation-switch'
import { DeleteButton } from './delete-button'
import { useTranslations } from 'next-intl'
import { createBrowserClient } from '@supabase/ssr'
import type { Role } from '@megacampus/shared-types'

/** Debounce timeout for search input in milliseconds */
const SEARCH_DEBOUNCE_MS = 300

export function UsersTable() {
  const t = useTranslations('admin.users')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentUserId, setCurrentUserId] = useState<string | null>('loading')

  const utils = trpc.useUtils()

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  // Fetch current user ID from Supabase auth
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    supabase.auth
      .getUser()
      .then(({ data }) => {
        setCurrentUserId(data.user?.id || null)
      })
      .catch((err) => {
        console.error('Failed to fetch current user:', err)
        setCurrentUserId(null)
        toast.error('Failed to identify current user. Some actions disabled for safety.')
      })
  }, [])

  // Fetch current user role via tRPC
  const { data: currentUserRoleData } = trpc.admin.getCurrentUserRole.useQuery(undefined, {
    retry: 1,
  })
  const currentUserRole: Role | 'loading' = currentUserRoleData?.role ?? 'loading'

  // Fetch users via tRPC
  const {
    data: usersData,
    isLoading: loading,
    error: queryError,
  } = trpc.admin.listUsers.useQuery(
    {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      search: debouncedSearch || undefined,
      role: roleFilter !== 'all' ? (roleFilter as Role) : undefined,
      isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
    },
    {
      placeholderData: keepPreviousData,
    }
  )

  const data = usersData?.users ?? []
  const totalCount = usersData?.totalCount ?? 0
  const error = queryError ? queryError.message || t('errors.loadFailed') : null

  // Show error toast when query fails
  useEffect(() => {
    if (error) {
      toast.error(error)
    }
  }, [error])

  const handleRoleUpdate = useCallback(() => {
    void utils.admin.listUsers.invalidate()
  }, [utils])

  const handleUserDeleted = useCallback(() => {
    void utils.admin.listUsers.invalidate()
  }, [utils])

  const totalPages = Math.ceil(totalCount / pageSize)

  const getStatusBadge = (isActive: boolean) => {
    if (isActive) {
      return (
        <Badge variant="secondary" className="bg-green-500/10 text-green-500 hover:bg-green-500/20">
          {t('status.active')}
        </Badge>
      )
    }
    return (
      <Badge variant="secondary" className="bg-gray-500/10 text-gray-500 hover:bg-gray-500/20">
        {t('status.inactive')}
      </Badge>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-card flex flex-col items-center justify-between gap-4 rounded-lg border p-4 shadow-sm sm:flex-row">
        <div className="relative w-full sm:w-72">
          <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
          <Input
            placeholder={t('filters.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label={t('filters.searchPlaceholder')}
          />
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
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

          <Button
            variant="outline"
            size="icon"
            onClick={() => void utils.admin.listUsers.invalidate()}
            disabled={loading}
            aria-label={t('actions.refresh')}
          >
            <Loader2 className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="bg-card overflow-hidden rounded-md border shadow-sm">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b">
              <tr className="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors">
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('table.email')}
                </th>
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('table.organization')}
                </th>
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('table.role')}
                </th>
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('table.status')}
                </th>
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('table.created')}
                </th>
                <th className="text-muted-foreground h-12 px-4 text-right align-middle font-medium">
                  {t('table.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {loading && data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="h-24 text-center">
                    <Loader2 className="text-muted-foreground mx-auto h-6 w-6 animate-spin" />
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
                  <td colSpan={6} className="text-muted-foreground h-24 text-center">
                    {t('table.noUsers')}
                  </td>
                </tr>
              ) : (
                data.map((user) => {
                  const isCurrentUser = currentUserId === user.id
                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors"
                    >
                      <td className="p-4 align-middle">
                        <div className="flex items-center gap-2">
                          <Mail className="text-muted-foreground h-4 w-4" />
                          <span className="font-medium">{user.email}</span>
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        <div className="text-muted-foreground flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          <span>{user.organizationName}</span>
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="p-4 align-middle">{getStatusBadge(user.isActive)}</td>
                      <td className="text-muted-foreground p-4 align-middle">
                        {user.createdAt &&
                          formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                      </td>
                      <td className="p-4 align-middle">
                        <div className="flex items-center justify-end gap-3">
                          {currentUserRole !== 'loading' && (
                            <RoleSelect
                              userId={user.id}
                              currentRole={user.role}
                              currentUserRole={currentUserRole}
                              onRoleUpdated={handleRoleUpdate}
                            />
                          )}
                          <ActivationSwitch
                            userId={user.id}
                            isActive={user.isActive}
                            disabled={currentUserId === 'loading' || isCurrentUser}
                          />
                          {currentUserRole !== 'loading' && (
                            <DeleteButton
                              userId={user.id}
                              userEmail={user.email}
                              userRole={user.role}
                              currentUserRole={currentUserRole}
                              isCurrentUser={isCurrentUser}
                              onDeleted={handleUserDeleted}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between px-2">
        <div className="text-muted-foreground text-sm">
          {t('pagination.showing', {
            from: (page - 1) * pageSize + 1,
            to: Math.min(page * pageSize, totalCount),
            total: totalCount,
          })}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            aria-label={t('pagination.previous')}
          >
            <ChevronLeft className="h-4 w-4" />
            {t('pagination.previous')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            aria-label={t('pagination.next')}
          >
            {t('pagination.next')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
