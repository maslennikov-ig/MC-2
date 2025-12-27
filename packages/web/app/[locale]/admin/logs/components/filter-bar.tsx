'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Search, X, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { LogFilters, LogLevel, LogType, LogStatus } from '@/app/actions/admin-logs';

interface FilterBarProps {
  filters: LogFilters;
  onFilterChange: (filters: LogFilters) => void;
}

/**
 * Filter controls for log monitoring dashboard
 */
export function FilterBar({ filters, onFilterChange }: FilterBarProps) {
  const t = useTranslations('admin.logs');

  const handleLevelChange = useCallback(
    (value: string) => {
      onFilterChange({
        ...filters,
        level: value === 'all' ? undefined : (value as LogLevel),
      });
    },
    [filters, onFilterChange]
  );

  const handleSourceChange = useCallback(
    (value: string) => {
      onFilterChange({
        ...filters,
        source: value === 'all' ? undefined : (value as LogType),
      });
    },
    [filters, onFilterChange]
  );

  const handleStatusChange = useCallback(
    (value: string) => {
      onFilterChange({
        ...filters,
        status: value === 'all' ? undefined : (value as LogStatus),
      });
    },
    [filters, onFilterChange]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      onFilterChange({
        ...filters,
        search: value || undefined,
      });
    },
    [filters, onFilterChange]
  );

  const handleDateFromChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      onFilterChange({
        ...filters,
        dateFrom: value ? new Date(value).toISOString() : undefined,
      });
    },
    [filters, onFilterChange]
  );

  const handleDateToChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      onFilterChange({
        ...filters,
        dateTo: value ? new Date(value).toISOString() : undefined,
      });
    },
    [filters, onFilterChange]
  );

  const handleClearFilters = useCallback(() => {
    onFilterChange({});
  }, [onFilterChange]);

  const hasFilters =
    filters.level ||
    filters.source ||
    filters.status ||
    filters.search ||
    filters.dateFrom ||
    filters.dateTo;

  // Convert ISO dates back to input format for display
  const dateFromValue = filters.dateFrom
    ? new Date(filters.dateFrom).toISOString().split('T')[0]
    : '';
  const dateToValue = filters.dateTo
    ? new Date(filters.dateTo).toISOString().split('T')[0]
    : '';

  return (
    <div className="flex flex-col gap-4 p-4 bg-card rounded-lg border shadow-sm">
      {/* Top row: Search and main filters */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        {/* Search input */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('filters.search')}
            value={filters.search || ''}
            onChange={handleSearchChange}
            className="pl-9"
            aria-label={t('filters.search')}
          />
        </div>

        {/* Filter dropdowns */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Level filter */}
          <Select
            value={filters.level || 'all'}
            onValueChange={handleLevelChange}
          >
            <SelectTrigger className="w-[130px]" aria-label={t('filters.level')}>
              <SelectValue placeholder={t('filters.level')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.level')}: All</SelectItem>
              <SelectItem value="WARNING">{t('levels.WARNING')}</SelectItem>
              <SelectItem value="ERROR">{t('levels.ERROR')}</SelectItem>
              <SelectItem value="CRITICAL">{t('levels.CRITICAL')}</SelectItem>
            </SelectContent>
          </Select>

          {/* Source filter */}
          <Select
            value={filters.source || 'all'}
            onValueChange={handleSourceChange}
          >
            <SelectTrigger className="w-[150px]" aria-label={t('filters.source')}>
              <SelectValue placeholder={t('filters.source')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.source')}: All</SelectItem>
              <SelectItem value="error_log">Error Log</SelectItem>
              <SelectItem value="generation_trace">Generation Trace</SelectItem>
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select
            value={filters.status || 'all'}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger className="w-[140px]" aria-label={t('filters.status')}>
              <SelectValue placeholder={t('filters.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.status')}: All</SelectItem>
              <SelectItem value="new">{t('status.new')}</SelectItem>
              <SelectItem value="in_progress">{t('status.in_progress')}</SelectItem>
              <SelectItem value="resolved">{t('status.resolved')}</SelectItem>
              <SelectItem value="ignored">{t('status.ignored')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bottom row: Date range and clear */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        {/* Date range */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t('filters.dateFrom')}:</span>
            <Input
              type="date"
              value={dateFromValue}
              onChange={handleDateFromChange}
              className="w-[150px] h-9"
              aria-label={t('filters.dateFrom')}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('filters.dateTo')}:</span>
            <Input
              type="date"
              value={dateToValue}
              onChange={handleDateToChange}
              className="w-[150px] h-9"
              aria-label={t('filters.dateTo')}
            />
          </div>
        </div>

        {/* Clear filters button */}
        {hasFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearFilters}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            {t('filters.clear')}
          </Button>
        )}
      </div>
    </div>
  );
}
