'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Check, Loader2, Mail, Link2, Hash } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { OrgRole, InvitationType } from '@megacampus/shared-types';

interface InviteModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal is closed */
  onOpenChange: (open: boolean) => void;
  /** Organization ID to create invitations for */
  organizationId: string;
  /** Callback when invitation is created successfully */
  onInviteCreated?: () => void;
}

type ExpirationOption = '1' | '7' | '30' | 'never';

const EXPIRATION_DAYS: Record<ExpirationOption, number | null> = {
  '1': 1,
  '7': 7,
  '30': 30,
  'never': null,
};

/**
 * Modal for inviting members to an organization.
 * Supports email, link, and code-based invitations.
 */
export function InviteModal({
  open,
  onOpenChange,
  organizationId,
  onInviteCreated,
}: InviteModalProps) {
  const t = useTranslations('organizations.invitations');
  const tRoles = useTranslations('organizations.roles');

  const [activeTab, setActiveTab] = useState<InvitationType>('email');
  const [role, setRole] = useState<OrgRole>('student');
  const [expiration, setExpiration] = useState<ExpirationOption>('7');
  const [maxUses, setMaxUses] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Email tab state
  const [emails, setEmails] = useState('');

  // Link tab state
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Code tab state
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const resetState = useCallback(() => {
    setEmails('');
    setGeneratedLink(null);
    setGeneratedCode(null);
    setLinkCopied(false);
    setCodeCopied(false);
    setRole('student');
    setExpiration('7');
    setMaxUses('');
    setActiveTab('email');
  }, []);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  const createInvitation = async (type: InvitationType, email?: string) => {
    const expiresInDays = EXPIRATION_DAYS[expiration];
    const body: Record<string, unknown> = {
      organizationId,
      invitationType: type,
      role,
      expiresInDays: expiresInDays ?? 365 * 100, // 100 years for "never"
    };

    if (type === 'email' && email) {
      body.email = email;
    }

    if (maxUses && parseInt(maxUses, 10) > 0) {
      body.maxUses = parseInt(maxUses, 10);
    }

    const response = await fetch(`/api/organizations/${organizationId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create invitation');
    }

    return response.json();
  };

  const handleSendEmails = async () => {
    const emailList = emails
      .split('\n')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    if (emailList.length === 0) {
      toast.error(t('errors.invalidEmail'));
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emailList.filter((e) => !emailRegex.test(e));
    if (invalidEmails.length > 0) {
      toast.error(t('errors.invalidEmail'));
      return;
    }

    setLoading(true);
    try {
      // Send invitations for each email
      await Promise.all(emailList.map((email) => createInvitation('email', email)));
      toast.success(t('success.emailSent'));
      onInviteCreated?.();
      handleOpenChange(false);
    } catch (error) {
      console.error('Failed to send invitations:', error);
      toast.error(t('errors.sendFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateLink = async () => {
    setLoading(true);
    try {
      const result = await createInvitation('link');
      const baseUrl = window.location.origin;
      setGeneratedLink(`${baseUrl}/join/${result.token}`);
      toast.success(t('success.linkCreated'));
      onInviteCreated?.();
    } catch (error) {
      console.error('Failed to generate link:', error);
      toast.error(t('errors.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCode = async () => {
    setLoading(true);
    try {
      const result = await createInvitation('code');
      setGeneratedCode(result.code);
      toast.success(t('success.codeCreated'));
      onInviteCreated?.();
    } catch (error) {
      console.error('Failed to generate code:', error);
      toast.error(t('errors.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'link') {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      } else {
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
      }
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const roles: OrgRole[] = ['manager', 'instructor', 'student'];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('role.hint')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as InvitationType)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="email" className="gap-2">
              <Mail className="h-4 w-4" />
              <span className="hidden sm:inline">{t('tabs.email')}</span>
            </TabsTrigger>
            <TabsTrigger value="link" className="gap-2">
              <Link2 className="h-4 w-4" />
              <span className="hidden sm:inline">{t('tabs.link')}</span>
            </TabsTrigger>
            <TabsTrigger value="code" className="gap-2">
              <Hash className="h-4 w-4" />
              <span className="hidden sm:inline">{t('tabs.code')}</span>
            </TabsTrigger>
          </TabsList>

          {/* Shared role and expiration controls */}
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role">{t('role.label')}</Label>
                <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
                  <SelectTrigger id="role">
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiration">{t('expiration.label')}</Label>
                <Select
                  value={expiration}
                  onValueChange={(v) => setExpiration(v as ExpirationOption)}
                >
                  <SelectTrigger id="expiration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('expiration.options.1day')}</SelectItem>
                    <SelectItem value="7">{t('expiration.options.7days')}</SelectItem>
                    <SelectItem value="30">{t('expiration.options.30days')}</SelectItem>
                    <SelectItem value="never">{t('expiration.options.never')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {activeTab !== 'email' && (
              <div className="space-y-2">
                <Label htmlFor="maxUses">{t('maxUses.label')}</Label>
                <Input
                  id="maxUses"
                  type="number"
                  min="1"
                  placeholder={t('maxUses.unlimited')}
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('maxUses.hint')}</p>
              </div>
            )}
          </div>

          {/* Email tab content */}
          <TabsContent value="email" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="emails">{t('email.label')}</Label>
              <Textarea
                id="emails"
                placeholder={t('email.placeholder')}
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">{t('email.hint')}</p>
            </div>
          </TabsContent>

          {/* Link tab content */}
          <TabsContent value="link" className="space-y-4">
            {generatedLink ? (
              <div className="space-y-2">
                <Label>{t('link.label')}</Label>
                <div className="flex gap-2">
                  <Input value={generatedLink} readOnly className="font-mono text-sm" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(generatedLink, 'link')}
                    aria-label={linkCopied ? t('link.copied') : t('link.copy')}
                  >
                    {linkCopied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('link.hint')}</p>
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground mb-4">{t('link.placeholder')}</p>
              </div>
            )}
          </TabsContent>

          {/* Code tab content */}
          <TabsContent value="code" className="space-y-4">
            {generatedCode ? (
              <div className="space-y-2">
                <Label>{t('code.label')}</Label>
                <div className="flex gap-2">
                  <Input
                    value={generatedCode}
                    readOnly
                    className="font-mono text-2xl text-center tracking-wider"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(generatedCode, 'code')}
                    aria-label={codeCopied ? t('code.copied') : t('code.copy')}
                  >
                    {codeCopied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('code.hint')}</p>
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground mb-4">{t('code.placeholder')}</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          {activeTab === 'email' && (
            <Button onClick={handleSendEmails} disabled={loading || !emails.trim()}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('actions.sending')}
                </>
              ) : (
                t('actions.send')
              )}
            </Button>
          )}
          {activeTab === 'link' && (
            <Button onClick={handleGenerateLink} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('actions.creating')}
                </>
              ) : generatedLink ? (
                t('link.regenerate')
              ) : (
                t('link.generate')
              )}
            </Button>
          )}
          {activeTab === 'code' && (
            <Button onClick={handleGenerateCode} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('actions.creating')}
                </>
              ) : generatedCode ? (
                t('code.regenerate')
              ) : (
                t('code.generate')
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
