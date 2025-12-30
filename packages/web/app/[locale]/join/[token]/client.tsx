'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Loader2,
  Building2,
  UserCheck,
  Clock,
  AlertCircle,
  CheckCircle,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { createClient } from '@/lib/supabase/client';
import type { OrgRole, InvitationType } from '@megacampus/shared-types';

interface InvitationData {
  id: string;
  invitationType: InvitationType;
  role: OrgRole;
  expiresAt: string;
  maxUses: number | null;
  currentUses: number;
}

interface OrganizationData {
  id: string;
  name: string;
  slug: string | null;
}

interface JoinOrganizationClientProps {
  token: string;
  invitation: InvitationData | null;
  organization: OrganizationData | null;
  errorType?: 'expired' | 'not_found' | 'error';
  errorMessage?: string;
}

type JoinStatus = 'idle' | 'loading' | 'success' | 'error';

export function JoinOrganizationClient({
  token,
  invitation,
  organization,
  errorType,
  errorMessage,
}: JoinOrganizationClientProps) {
  const t = useTranslations('organizations.join');
  const tRoles = useTranslations('organizations.roles');
  const router = useRouter();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [joinStatus, setJoinStatus] = useState<JoinStatus>('idle');
  const [joinError, setJoinError] = useState<string | null>(null);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);
    };

    checkAuth();

    // Listen for auth state changes
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleJoin = async () => {
    if (!invitation || !organization) return;

    setJoinStatus('loading');
    setJoinError(null);

    try {
      const response = await fetch(`/api/invitations/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || t('errors.joinFailed'));
      }

      setJoinStatus('success');
      toast.success(t('success.joined', { org: organization.name }));

      // Redirect to organization dashboard after short delay
      setTimeout(() => {
        router.push(`/org/${organization.slug || organization.id}`);
      }, 1500);
    } catch (error) {
      setJoinStatus('error');
      const message = error instanceof Error ? error.message : t('errors.joinFailed');
      setJoinError(message);
      toast.error(message);
    }
  };

  const handleSignIn = () => {
    // Redirect to sign in with return URL
    const returnUrl = encodeURIComponent(`/join/${token}`);
    router.push(`/auth/signin?redirect=${returnUrl}`);
  };

  const handleSignUp = () => {
    // Redirect to sign up with return URL and invitation token
    const returnUrl = encodeURIComponent(`/join/${token}`);
    router.push(`/auth/signup?redirect=${returnUrl}&invite=${token}`);
  };

  // Error states
  if (errorType) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
              <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle>
              {errorType === 'expired'
                ? t('errors.expiredTitle')
                : errorType === 'not_found'
                  ? t('errors.notFoundTitle')
                  : t('errors.errorTitle')}
            </CardTitle>
            <CardDescription>
              {errorType === 'expired'
                ? t('errors.expiredDescription')
                : errorType === 'not_found'
                  ? t('errors.notFoundDescription')
                  : errorMessage || t('errors.errorDescription')}
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="outline" onClick={() => router.push('/')}>
              {t('actions.goHome')}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Loading auth state
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (joinStatus === 'success' && organization) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>{t('success.title')}</CardTitle>
            <CardDescription>
              {t('success.description', { org: organization.name })}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">{t('success.redirecting')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main invitation view
  if (!invitation || !organization) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const expiresAt = new Date(invitation.expiresAt);
  const isExpiringSoon = expiresAt.getTime() - Date.now() < 24 * 60 * 60 * 1000; // Less than 24 hours

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>
            {t('description', { org: organization.name })}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Organization Info */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t('orgLabel')}</p>
                <p className="font-medium">{organization.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <UserCheck className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t('roleLabel')}</p>
                <Badge variant="secondary">{tRoles(invitation.role)}</Badge>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t('expiresLabel')}</p>
                <p className={isExpiringSoon ? 'text-yellow-600 dark:text-yellow-400' : ''}>
                  {formatDistanceToNow(expiresAt, { addSuffix: true })}
                </p>
              </div>
            </div>
          </div>

          {/* Error alert */}
          {joinError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('errors.joinFailedTitle')}</AlertTitle>
              <AlertDescription>{joinError}</AlertDescription>
            </Alert>
          )}

          {/* Expiring soon warning */}
          {isExpiringSoon && !joinError && (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertTitle>{t('warnings.expiringSoonTitle')}</AlertTitle>
              <AlertDescription>{t('warnings.expiringSoonDescription')}</AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          {isAuthenticated ? (
            // Authenticated user - show join button
            <Button
              className="w-full"
              size="lg"
              onClick={handleJoin}
              disabled={joinStatus === 'loading'}
            >
              {joinStatus === 'loading' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('actions.joining')}
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4 mr-2" />
                  {t('actions.join')}
                </>
              )}
            </Button>
          ) : (
            // Not authenticated - show sign in/up options
            <>
              <Button className="w-full" size="lg" onClick={handleSignIn}>
                <LogIn className="h-4 w-4 mr-2" />
                {t('actions.signInToJoin')}
              </Button>
              <Button variant="outline" className="w-full" size="lg" onClick={handleSignUp}>
                <UserPlus className="h-4 w-4 mr-2" />
                {t('actions.signUpToJoin')}
              </Button>
              <p className="text-xs text-center text-muted-foreground mt-2">
                {t('authHint')}
              </p>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
