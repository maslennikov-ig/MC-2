'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Building2, ChevronDown, Plus, Check, Loader2, RefreshCw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OrganizationWithMembership } from '@megacampus/shared-types';

interface OrganizationSwitcherProps {
  /** Current organization ID */
  currentOrgId?: string;
  /** Callback when organization is switched */
  onSwitch?: (orgId: string) => void;
  /** Optional className for the trigger button */
  className?: string;
  /** Show compact version (icon only on mobile) */
  compact?: boolean;
}

/**
 * Organization switcher dropdown component.
 * Displays current organization and allows switching between user's organizations.
 */
export function OrganizationSwitcher({
  currentOrgId,
  onSwitch,
  className,
  compact = false,
}: OrganizationSwitcherProps) {
  const t = useTranslations('organizations');
  const router = useRouter();
  const [organizations, setOrganizations] = useState<OrganizationWithMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const currentOrg = organizations.find((org) => org.id === currentOrgId);

  const fetchOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/organizations');
      if (!response.ok) {
        throw new Error('Failed to fetch organizations');
      }
      const data = await response.json();
      // Handle both array and object formats
      setOrganizations(Array.isArray(data) ? data : data.organizations || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Failed to fetch organizations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const handleSelect = (orgId: string) => {
    if (orgId === currentOrgId) {
      setOpen(false);
      return;
    }

    if (onSwitch) {
      onSwitch(orgId);
    }
    setOpen(false);
  };

  const handleCreateNew = () => {
    setOpen(false);
    router.push('/org/create');
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={t('switcher.label')}
          className={cn(
            'justify-between gap-2',
            compact ? 'w-10 px-0 md:w-[200px] md:px-3' : 'w-[200px]',
            className
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className={cn('truncate', compact && 'hidden md:inline')}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : currentOrg ? (
                currentOrg.name
              ) : (
                t('switcher.noOrganizations')
              )}
            </span>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 opacity-50 transition-transform',
              open && 'rotate-180',
              compact && 'hidden md:block'
            )}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[200px]" align="start">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t('switcher.label')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="px-2 py-4 text-center">
            <p className="text-sm text-destructive mb-2">{error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.preventDefault();
                fetchOrganizations();
              }}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              {t('switcher.retry')}
            </Button>
          </div>
        ) : organizations.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            {t('switcher.noOrganizations')}
          </div>
        ) : (
          organizations.map((org) => (
            <DropdownMenuItem
              key={org.id}
              onSelect={() => handleSelect(org.id)}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-2 w-full">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{org.name}</span>
                {org.id === currentOrgId && (
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                )}
              </div>
            </DropdownMenuItem>
          ))
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={handleCreateNew}
          className="cursor-pointer text-primary"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t('switcher.createNew')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
