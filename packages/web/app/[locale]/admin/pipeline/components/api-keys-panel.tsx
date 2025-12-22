/**
 * API Keys Panel Component
 *
 * Display and manage API key configurations for the pipeline.
 * Shows status of API keys (configured/not configured) and allows
 * viewing which source (env var or database) is being used.
 *
 * Features:
 * - Shows Jina API key status
 * - Shows OpenRouter API key status
 * - Allows switching between env var and database source
 * - Masked input for entering API keys
 *
 * @module app/admin/pipeline/components/api-keys-panel
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { KeyRound, Eye, EyeOff, CheckCircle2, XCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getApiKeyStatus, updateApiKeyConfig, testApiKey } from '@/app/actions/pipeline-admin';

interface ApiKeyStatus {
  key: string;
  source: 'env' | 'database';
  envVar: string;
  isConfigured: boolean;
  lastTested?: string;
  testStatus?: 'success' | 'failed' | 'unknown';
}

/**
 * API Keys Panel - Manage API key configurations
 */
export function ApiKeysPanel() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jinaStatus, setJinaStatus] = useState<ApiKeyStatus | null>(null);
  const [openRouterStatus, setOpenRouterStatus] = useState<ApiKeyStatus | null>(null);
  const [jinaKey, setJinaKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [showJinaKey, setShowJinaKey] = useState(false);
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
  const [isTesting, setIsTesting] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<string | null>(null);

  // Load API key status
  const loadStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await getApiKeyStatus();

      if (result.jina) {
        setJinaStatus(result.jina);
      }
      if (result.openRouter) {
        setOpenRouterStatus(result.openRouter);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API key status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Test API key
  const handleTestKey = async (keyType: 'jina' | 'openrouter') => {
    setIsTesting(keyType);
    try {
      const result = await testApiKey(keyType);
      if (result.success) {
        toast.success(`${keyType === 'jina' ? 'Jina' : 'OpenRouter'} API key is valid`);
        // Refresh status after test
        await loadStatus();
      } else {
        toast.error(result.error || `${keyType === 'jina' ? 'Jina' : 'OpenRouter'} API key test failed`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to test API key');
    } finally {
      setIsTesting(null);
    }
  };

  // Save API key configuration
  const handleSaveConfig = async (keyType: 'jina' | 'openrouter', source: 'env' | 'database', value?: string) => {
    setIsSaving(keyType);
    try {
      await updateApiKeyConfig(keyType, source, value);
      toast.success(`${keyType === 'jina' ? 'Jina' : 'OpenRouter'} configuration updated`);
      // Clear input and refresh status
      if (keyType === 'jina') {
        setJinaKey('');
      } else {
        setOpenRouterKey('');
      }
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update configuration');
    } finally {
      setIsSaving(null);
    }
  };

  // Error state
  if (error) {
    return (
      <Card className="admin-glass-card border-destructive/50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-destructive" />
            <div>
              <h3 className="font-semibold text-destructive">Failed to load API keys</h3>
              <p className="text-sm text-destructive/80 mt-1">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <Card className="admin-glass-card">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="admin-glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2" style={{ color: 'rgb(var(--admin-text-primary))' }}>
          <KeyRound className="h-5 w-5 text-cyan-400" />
          API Keys
        </CardTitle>
        <CardDescription style={{ color: 'rgb(var(--admin-text-secondary))' }}>
          Configure API keys for external services. Keys can be loaded from environment variables or stored in database.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Jina API Key */}
        <div className="p-4 rounded-lg bg-black/20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h4 className="font-medium" style={{ color: 'rgb(var(--admin-text-primary))' }}>
                Jina API Key
              </h4>
              {jinaStatus?.isConfigured ? (
                <Badge variant="outline" className="border-green-500/50 text-green-400 bg-green-500/10">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Configured
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-500/10">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Not Configured
                </Badge>
              )}
              {jinaStatus?.testStatus === 'success' && (
                <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 bg-cyan-500/10">
                  Verified
                </Badge>
              )}
              {jinaStatus?.testStatus === 'failed' && (
                <Badge variant="outline" className="border-red-500/50 text-red-400 bg-red-500/10">
                  <XCircle className="h-3 w-3 mr-1" />
                  Invalid
                </Badge>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTestKey('jina')}
              disabled={isTesting === 'jina' || !jinaStatus?.isConfigured}
              className="border-cyan-500/30 hover:border-cyan-500/50"
            >
              {isTesting === 'jina' ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                'Test Connection'
              )}
            </Button>
          </div>

          <p className="text-xs" style={{ color: 'rgb(var(--admin-text-tertiary))' }}>
            Used for embeddings and quality validation (semantic similarity checks)
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label style={{ color: 'rgb(var(--admin-text-secondary))' }}>Source</Label>
              <Select
                value={jinaStatus?.source || 'env'}
                onValueChange={(value: 'env' | 'database') => {
                  if (value === 'env') {
                    handleSaveConfig('jina', 'env');
                  }
                }}
              >
                <SelectTrigger className="bg-transparent border-cyan-500/20 focus:border-cyan-500/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="env">Environment Variable ({jinaStatus?.envVar})</SelectItem>
                  <SelectItem value="database">Database (encrypted)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {jinaStatus?.source === 'database' && (
              <div className="space-y-2">
                <Label style={{ color: 'rgb(var(--admin-text-secondary))' }}>API Key</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showJinaKey ? 'text' : 'password'}
                      placeholder="Enter Jina API key..."
                      value={jinaKey}
                      onChange={(e) => setJinaKey(e.target.value)}
                      className="bg-transparent border-cyan-500/20 focus:border-cyan-500/50 text-white pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowJinaKey(!showJinaKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      {showJinaKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    onClick={() => handleSaveConfig('jina', 'database', jinaKey)}
                    disabled={!jinaKey || isSaving === 'jina'}
                    className="admin-btn-primary"
                  >
                    {isSaving === 'jina' ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Save'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* OpenRouter API Key */}
        <div className="p-4 rounded-lg bg-black/20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h4 className="font-medium" style={{ color: 'rgb(var(--admin-text-primary))' }}>
                OpenRouter API Key
              </h4>
              {openRouterStatus?.isConfigured ? (
                <Badge variant="outline" className="border-green-500/50 text-green-400 bg-green-500/10">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Configured
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-500/10">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Not Configured
                </Badge>
              )}
              {openRouterStatus?.testStatus === 'success' && (
                <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 bg-cyan-500/10">
                  Verified
                </Badge>
              )}
              {openRouterStatus?.testStatus === 'failed' && (
                <Badge variant="outline" className="border-red-500/50 text-red-400 bg-red-500/10">
                  <XCircle className="h-3 w-3 mr-1" />
                  Invalid
                </Badge>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTestKey('openrouter')}
              disabled={isTesting === 'openrouter' || !openRouterStatus?.isConfigured}
              className="border-cyan-500/30 hover:border-cyan-500/50"
            >
              {isTesting === 'openrouter' ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                'Test Connection'
              )}
            </Button>
          </div>

          <p className="text-xs" style={{ color: 'rgb(var(--admin-text-tertiary))' }}>
            Used for LLM model access (summarization, analysis, content generation)
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label style={{ color: 'rgb(var(--admin-text-secondary))' }}>Source</Label>
              <Select
                value={openRouterStatus?.source || 'env'}
                onValueChange={(value: 'env' | 'database') => {
                  if (value === 'env') {
                    handleSaveConfig('openrouter', 'env');
                  }
                }}
              >
                <SelectTrigger className="bg-transparent border-cyan-500/20 focus:border-cyan-500/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="env">Environment Variable ({openRouterStatus?.envVar})</SelectItem>
                  <SelectItem value="database">Database (encrypted)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {openRouterStatus?.source === 'database' && (
              <div className="space-y-2">
                <Label style={{ color: 'rgb(var(--admin-text-secondary))' }}>API Key</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showOpenRouterKey ? 'text' : 'password'}
                      placeholder="Enter OpenRouter API key..."
                      value={openRouterKey}
                      onChange={(e) => setOpenRouterKey(e.target.value)}
                      className="bg-transparent border-cyan-500/20 focus:border-cyan-500/50 text-white pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOpenRouterKey(!showOpenRouterKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      {showOpenRouterKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    onClick={() => handleSaveConfig('openrouter', 'database', openRouterKey)}
                    disabled={!openRouterKey || isSaving === 'openrouter'}
                    className="admin-btn-primary"
                  >
                    {isSaving === 'openrouter' ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Save'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info about env vars */}
        <div className="text-xs p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20" style={{ color: 'rgb(var(--admin-text-tertiary))' }}>
          <p className="font-medium text-cyan-400 mb-1">Environment Variables</p>
          <p>
            When using &quot;Environment Variable&quot; source, keys are loaded from your server&apos;s .env file.
            This is more secure for production. Database storage is useful for development or when you need
            to change keys without redeploying.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
