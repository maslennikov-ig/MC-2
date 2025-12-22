/**
 * ExportImportPanel Component (T057)
 *
 * Comprehensive export/import panel for pipeline configuration.
 *
 * Features:
 * - Export: Download current config as JSON with metadata
 * - Import: Upload JSON file, validate, preview changes, configure import options
 * - Backups: List recent backups with restore functionality
 * - Confirmations: Alert dialogs for import and restore operations
 *
 * @module app/admin/pipeline/components/export-import
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Download,
  Upload,
  RotateCcw,
  FileJson,
  Loader2,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  exportConfiguration,
  validateImport,
  importConfiguration,
  listBackups,
  restoreFromBackup,
} from '@/app/actions/pipeline-admin';
import type { ConfigBackup, ConfigExport, ImportPreview } from '@megacampus/shared-types';

/**
 * Export/Import Panel - Export config, import config, manage backups
 */
export function ExportImportPanel() {
  // Export state
  const [isExporting, setIsExporting] = useState(false);

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<ConfigExport | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importOptions, setImportOptions] = useState({
    importModelConfigs: true,
    importPromptTemplates: true,
    importGlobalSettings: true,
    createBackup: true,
  });
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Backups state
  const [backups, setBackups] = useState<ConfigBackup[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<ConfigBackup | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Export handler - downloads JSON file
  const handleExport = async () => {
    try {
      setIsExporting(true);
      const result = await exportConfiguration();
      const exportData = result.result?.data || result.result;

      // Create and download file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pipeline-config-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Configuration exported successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  // File upload handler
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsValidating(true);
      setValidationError(null);
      const text = await file.text();
      const data = JSON.parse(text) as ConfigExport;
      setImportFile(data);

      // Validate via backend
      const result = await validateImport({ exportData: data });
      setImportPreview(result.result?.data || result.result);
      toast.success('Import file validated successfully');
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Invalid JSON file');
      toast.error('Failed to validate import file');
      setImportFile(null);
      setImportPreview(null);
    } finally {
      setIsValidating(false);
    }
  };

  // Import handler
  const handleImport = async () => {
    if (!importFile) return;

    try {
      setIsImporting(true);
      await importConfiguration({
        exportData: importFile,
        options: importOptions,
      });
      toast.success('Configuration imported successfully');
      // Reset state
      setImportFile(null);
      setImportPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      // Refresh backups list
      loadBackups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsImporting(false);
      setShowImportConfirm(false);
    }
  };

  // Load backups
  const loadBackups = async () => {
    try {
      setIsLoadingBackups(true);
      const result = await listBackups();
      setBackups(result.result?.data || result.result || []);
    } catch (_err) {
      toast.error('Failed to load backups');
    } finally {
      setIsLoadingBackups(false);
    }
  };

  // Restore handler
  const handleRestore = async () => {
    if (!restoreTarget) return;

    try {
      setIsRestoring(true);
      await restoreFromBackup({
        backupId: restoreTarget.id,
        options: {
          restoreModelConfigs: true,
          restorePromptTemplates: true,
          restoreGlobalSettings: true,
        },
      });
      toast.success(`Restored from ${restoreTarget.backupName}`);
      loadBackups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setIsRestoring(false);
      setRestoreTarget(null);
    }
  };

  // Load backups on mount
  useEffect(() => {
    loadBackups();
  }, []);

  return (
    <div className="space-y-6">
      {/* Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Configuration
          </CardTitle>
          <CardDescription>
            Download current pipeline configuration as JSON file. Includes model configs, prompt
            templates, and global settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileJson className="h-4 w-4 mr-2" />
            )}
            Export to JSON
          </Button>
        </CardContent>
      </Card>

      {/* Import Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Configuration
          </CardTitle>
          <CardDescription>
            Upload a configuration JSON file to import. Changes will be validated before import.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isValidating}
          >
            {isValidating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Select JSON File
          </Button>

          {/* Validation error */}
          {validationError && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-3 flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">Validation Error</p>
                <p className="text-sm text-destructive/80">{validationError}</p>
              </div>
            </div>
          )}

          {/* Import preview */}
          {importPreview && importFile && !validationError && (
            <>
              <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <h4 className="font-medium">Import Preview</h4>
                </div>
                <Separator />
                <div className="text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Model Configs:</span>
                    <Badge variant="outline">
                      {importPreview.modelConfigChanges?.length || 0} changes
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Prompt Templates:</span>
                    <Badge variant="outline">
                      {importPreview.promptTemplateChanges?.length || 0} changes
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Global Settings:</span>
                    <Badge variant="outline">
                      {importPreview.settingsChanges?.length || 0} changes
                    </Badge>
                  </div>
                </div>
                {/* Detailed changes */}
                {importPreview.modelConfigChanges && importPreview.modelConfigChanges.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Model Changes:</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5 ml-4">
                      {importPreview.modelConfigChanges.map((change, idx) => (
                        <li key={idx} className="list-disc">
                          {change.phaseName}: {change.currentModelId || '(none)'} → {change.newModelId}
                          <Badge variant="secondary" className="ml-2 text-xs">
                            {change.changeType}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3 flex items-start gap-2 mt-3">
                  <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-900 dark:text-blue-100">
                    Exported from platform version: <strong>{importFile.platformVersion}</strong> on{' '}
                    {new Date(importFile.exportedAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Import options */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Import Options</Label>
                <div className="space-y-3 ml-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="importModels"
                      checked={importOptions.importModelConfigs}
                      onCheckedChange={(checked) =>
                        setImportOptions((prev) => ({ ...prev, importModelConfigs: !!checked }))
                      }
                    />
                    <Label htmlFor="importModels" className="text-sm font-normal cursor-pointer">
                      Import Model Configs
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="importPrompts"
                      checked={importOptions.importPromptTemplates}
                      onCheckedChange={(checked) =>
                        setImportOptions((prev) => ({
                          ...prev,
                          importPromptTemplates: !!checked,
                        }))
                      }
                    />
                    <Label htmlFor="importPrompts" className="text-sm font-normal cursor-pointer">
                      Import Prompt Templates
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="importSettings"
                      checked={importOptions.importGlobalSettings}
                      onCheckedChange={(checked) =>
                        setImportOptions((prev) => ({
                          ...prev,
                          importGlobalSettings: !!checked,
                        }))
                      }
                    />
                    <Label htmlFor="importSettings" className="text-sm font-normal cursor-pointer">
                      Import Global Settings
                    </Label>
                  </div>
                  <Separator />
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="createBackup"
                      checked={importOptions.createBackup}
                      onCheckedChange={(checked) =>
                        setImportOptions((prev) => ({ ...prev, createBackup: !!checked }))
                      }
                    />
                    <Label htmlFor="createBackup" className="text-sm font-normal cursor-pointer">
                      Create Backup Before Import
                    </Label>
                  </div>
                </div>
              </div>

              {/* Import button */}
              <Button
                onClick={() => setShowImportConfirm(true)}
                disabled={isImporting}
                className="w-full"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import Configuration
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Backups Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Configuration Backups
          </CardTitle>
          <CardDescription>
            View and restore from previous configuration backups. Backups are created automatically
            before imports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingBackups ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No backups found</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((backup) => (
                    <TableRow key={backup.id}>
                      <TableCell className="font-medium">{backup.backupName}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            backup.backupType === 'manual'
                              ? 'default'
                              : backup.backupType === 'auto_pre_import'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {backup.backupType === 'auto_pre_import' ? 'auto' : backup.backupType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(backup.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {backup.createdByEmail || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRestoreTarget(backup)}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Restore
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import Confirmation Dialog */}
      <AlertDialog open={showImportConfirm} onOpenChange={setShowImportConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Configuration Import</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This will overwrite your current configuration with the imported settings.
                {importOptions.createBackup
                  ? ' A backup will be created automatically.'
                  : ' No backup will be created.'}
              </p>
              <p className="font-medium text-foreground">Importing:</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                {importOptions.importModelConfigs && (
                  <li>
                    Model Configs ({importPreview?.modelConfigChanges?.length || 0} changes)
                  </li>
                )}
                {importOptions.importPromptTemplates && (
                  <li>
                    Prompt Templates ({importPreview?.promptTemplateChanges?.length || 0} changes)
                  </li>
                )}
                {importOptions.importGlobalSettings && (
                  <li>Global Settings ({importPreview?.settingsChanges?.length || 0} changes)</li>
                )}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isImporting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleImport} disabled={isImporting}>
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                'Import'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={!!restoreTarget} onOpenChange={() => setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Backup Restore</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This will restore your configuration from the backup{' '}
                <strong>{restoreTarget?.backupName}</strong>.
              </p>
              <p>
                Created on {restoreTarget && new Date(restoreTarget.createdAt).toLocaleString()} by{' '}
                {restoreTarget?.createdByEmail || 'system'}
              </p>
              <p className="font-medium text-foreground">
                All current settings will be replaced with the backup version.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={isRestoring}>
              {isRestoring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Restoring...
                </>
              ) : (
                'Restore'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
