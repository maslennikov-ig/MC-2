'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { TierSettings } from '@megacampus/shared-types';
import { updateTierSettingsAction } from '@/app/actions/admin-tiers';

interface TierEditDialogProps {
  tier: TierSettings;
  onClose: () => void;
  onTierUpdated: (tier: TierSettings) => void;
}

// MIME type validation regex
const MIME_TYPE_REGEX = /^[a-z]+\/[a-z0-9\-\+\.]+$/i;

export function TierEditDialog({ tier, onClose, onTierUpdated }: TierEditDialogProps) {
  const t = useTranslations('admin.pricing');
  const [loading, setLoading] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);

  // Form state
  const [displayName, setDisplayName] = useState(tier.displayName);
  const [maxFilesPerCourse, setMaxFilesPerCourse] = useState(tier.maxFilesPerCourse);
  const [maxConcurrentJobs, setMaxConcurrentJobs] = useState(tier.maxConcurrentJobs);
  const [isActive, setIsActive] = useState(tier.isActive);
  const [mimeTypesText, setMimeTypesText] = useState(tier.allowedMimeTypes.join(', '));
  const [extensionsText, setExtensionsText] = useState(tier.allowedExtensions.join(', '));
  const [featuresJson, setFeaturesJson] = useState(JSON.stringify(tier.features, null, 2));

  const bytesToMB = (bytes: number) => Math.round(bytes / (1024 * 1024));
  const mbToBytes = (mb: number) => mb * 1024 * 1024;
  const bytesToGB = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(2);
  const gbToBytes = (gb: number) => Math.round(gb * 1024 * 1024 * 1024);
  const centsToDollars = (cents: number) => (cents / 100).toFixed(2);
  const dollarsToCents = (dollars: number) => Math.round(dollars * 100);

  const [storageMB, setStorageMB] = useState(() => {
    // Use GB for large values, MB for smaller
    if (tier.storageQuotaBytes >= 100 * 1024 * 1024) {
      return parseFloat(bytesToGB(tier.storageQuotaBytes));
    }
    return bytesToMB(tier.storageQuotaBytes);
  });
  const [storageUnit, setStorageUnit] = useState<'MB' | 'GB'>(
    tier.storageQuotaBytes >= 100 * 1024 * 1024 ? 'GB' : 'MB'
  );

  const [maxFileSizeMB, setMaxFileSizeMB] = useState(bytesToMB(tier.maxFileSizeBytes));
  const [priceUSD, setPriceUSD] = useState(centsToDollars(tier.monthlyPriceCents));

  const handleIsActiveToggle = (checked: boolean) => {
    // If user is trying to deactivate an active tier, show confirmation
    if (tier.isActive && !checked) {
      setShowDeactivateConfirm(true);
    } else {
      setIsActive(checked);
    }
  };

  const confirmDeactivate = () => {
    setIsActive(false);
    setShowDeactivateConfirm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Parse MIME types and extensions
      const allowedMimeTypes = mimeTypesText
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const allowedExtensions = extensionsText
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      // Validate MIME types
      const invalidMimeTypes = allowedMimeTypes.filter(
        (mime) => !MIME_TYPE_REGEX.test(mime)
      );

      if (invalidMimeTypes.length > 0) {
        toast.error(`${t('errors.invalidMimeType')}: ${invalidMimeTypes.join(', ')}`);
        setLoading(false);
        return;
      }

      // Parse features JSON
      let features: Record<string, unknown> = {};
      if (featuresJson.trim()) {
        try {
          features = JSON.parse(featuresJson);
        } catch (err) {
          toast.error(t('errors.invalidJson'));
          setLoading(false);
          return;
        }
      }

      // Validate storage limits (max 1 TB)
      const maxStorageGB = 1000; // 1 TB
      const storageInGB = storageUnit === 'GB' ? storageMB : storageMB / 1024;
      if (storageInGB > maxStorageGB) {
        toast.error(t('errors.storageExceedsLimit'));
        setLoading(false);
        return;
      }

      // Convert storage based on unit
      const finalStorageBytes =
        storageUnit === 'GB' ? gbToBytes(storageMB) : mbToBytes(storageMB);

      const updatedTier = await updateTierSettingsAction({
        tierKey: tier.tierKey,
        displayName,
        storageQuotaBytes: finalStorageBytes,
        maxFileSizeBytes: mbToBytes(maxFileSizeMB),
        maxFilesPerCourse,
        maxConcurrentJobs,
        allowedMimeTypes,
        allowedExtensions,
        monthlyPriceCents: dollarsToCents(parseFloat(priceUSD)),
        features,
        isActive,
      });

      toast.success(t('success.tierUpdated'));
      onTierUpdated(updatedTier);
    } catch (error) {
      console.error('Failed to update tier:', error);
      toast.error(
        error instanceof Error ? error.message : t('errors.updateFailed')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('editTier')}: {tier.displayName}</DialogTitle>
          <DialogDescription>
            Tier: <span className="font-mono text-xs">{tier.tierKey}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="displayName">{t('displayName')}</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>

            {/* Storage Quota */}
            <div className="space-y-2">
              <Label htmlFor="storageQuota">{t('storage')}</Label>
              <div className="flex gap-2">
                <Input
                  id="storageQuota"
                  type="number"
                  value={storageMB}
                  onChange={(e) => setStorageMB(parseFloat(e.target.value))}
                  required
                  min="0"
                  step="0.01"
                  className="flex-1"
                />
                <select
                  value={storageUnit}
                  onChange={(e) => {
                    const newUnit = e.target.value as 'MB' | 'GB';
                    if (newUnit === 'GB' && storageUnit === 'MB') {
                      setStorageMB(storageMB / 1024);
                    } else if (newUnit === 'MB' && storageUnit === 'GB') {
                      setStorageMB(storageMB * 1024);
                    }
                    setStorageUnit(newUnit);
                  }}
                  className="px-3 py-2 border rounded-md bg-background"
                >
                  <option value="MB">MB</option>
                  <option value="GB">GB</option>
                </select>
              </div>
            </div>

            {/* Max File Size */}
            <div className="space-y-2">
              <Label htmlFor="maxFileSize">{t('maxFileSize')} (MB)</Label>
              <Input
                id="maxFileSize"
                type="number"
                value={maxFileSizeMB}
                onChange={(e) => setMaxFileSizeMB(parseInt(e.target.value))}
                required
                min="1"
              />
            </div>

            {/* Max Files Per Course */}
            <div className="space-y-2">
              <Label htmlFor="maxFiles">{t('filesPerCourse')}</Label>
              <Input
                id="maxFiles"
                type="number"
                value={maxFilesPerCourse}
                onChange={(e) => setMaxFilesPerCourse(parseInt(e.target.value))}
                required
                min="0"
              />
            </div>

            {/* Max Concurrent Jobs */}
            <div className="space-y-2">
              <Label htmlFor="maxJobs">{t('concurrentJobs')}</Label>
              <Input
                id="maxJobs"
                type="number"
                value={maxConcurrentJobs}
                onChange={(e) => setMaxConcurrentJobs(parseInt(e.target.value))}
                required
                min="1"
              />
            </div>

            {/* Monthly Price */}
            <div className="space-y-2">
              <Label htmlFor="price">{t('price')} (USD)</Label>
              <Input
                id="price"
                type="number"
                value={priceUSD}
                onChange={(e) => setPriceUSD(e.target.value)}
                required
                min="0"
                step="0.01"
              />
            </div>

            {/* MIME Types */}
            <div className="space-y-2">
              <Label htmlFor="mimeTypes">{t('mimeTypes')}</Label>
              <Textarea
                id="mimeTypes"
                value={mimeTypesText}
                onChange={(e) => setMimeTypesText(e.target.value)}
                rows={3}
                placeholder="application/pdf, text/plain, ..."
              />
              <p className="text-xs text-muted-foreground">Comma-separated list</p>
            </div>

            {/* Extensions */}
            <div className="space-y-2">
              <Label htmlFor="extensions">{t('extensions')}</Label>
              <Textarea
                id="extensions"
                value={extensionsText}
                onChange={(e) => setExtensionsText(e.target.value)}
                rows={2}
                placeholder="pdf, txt, docx, ..."
              />
              <p className="text-xs text-muted-foreground">Comma-separated list</p>
            </div>

            {/* Features JSON */}
            <div className="space-y-2">
              <Label htmlFor="features">{t('features')}</Label>
              <Textarea
                id="features"
                value={featuresJson}
                onChange={(e) => setFeaturesJson(e.target.value)}
                rows={4}
                placeholder="{}"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">Valid JSON object</p>
            </div>

            {/* Is Active */}
            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={isActive}
                onCheckedChange={handleIsActiveToggle}
              />
              <Label htmlFor="isActive">{t('active')}</Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      {/* Deactivation Confirmation Dialog */}
      <AlertDialog open={showDeactivateConfirm} onOpenChange={setShowDeactivateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('errors.deactivateConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('errors.deactivateConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeactivate}>
              {t('errors.deactivateConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
