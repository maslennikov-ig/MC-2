'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Loader2,
  KeyRound,
  AlertCircle,
  CheckCircle,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

type JoinStatus = 'idle' | 'loading' | 'success' | 'error';

interface JoinResult {
  organization: {
    id: string;
    name: string;
    slug: string | null;
  };
  role: string;
}

/**
 * JoinByCode Component
 *
 * Client component for joining an organization via a 6-character code.
 * Validates code format and handles both authenticated and unauthenticated states.
 */
export function JoinByCode() {
  const t = useTranslations('organizations.join');
  const router = useRouter();

  const [code, setCode] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [joinStatus, setJoinStatus] = useState<JoinStatus>('idle');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinResult, setJoinResult] = useState<JoinResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current && isAuthenticated !== null) {
      inputRef.current.focus();
    }
  }, [isAuthenticated]);

  // Format code input (uppercase, alphanumeric only)
  const handleCodeChange = (value: string) => {
    // Remove non-alphanumeric characters and convert to uppercase
    const formatted = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    // Limit to 6 characters
    setCode(formatted.slice(0, 6));
    // Clear previous error when typing
    if (joinError) {
      setJoinError(null);
      setJoinStatus('idle');
    }
  };

  const isCodeValid = code.length === 6;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isCodeValid) {
      setJoinError(t('code.errors.invalidFormat'));
      return;
    }

    setJoinStatus('loading');
    setJoinError(null);

    try {
      const response = await fetch('/api/invitations/code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || t('code.errors.joinFailed'));
      }

      setJoinStatus('success');
      setJoinResult(data);
      toast.success(t('success.joined', { org: data.organization.name }));

      // Redirect to organization dashboard after short delay
      setTimeout(() => {
        router.push(`/org/${data.organization.slug || data.organization.id}`);
      }, 1500);
    } catch (error) {
      setJoinStatus('error');
      const message = error instanceof Error ? error.message : t('code.errors.joinFailed');
      setJoinError(message);
      toast.error(message);
    }
  };

  const handleSignIn = () => {
    // Redirect to sign in with return URL
    const returnUrl = encodeURIComponent('/join');
    router.push(`/auth/signin?redirect=${returnUrl}`);
  };

  const handleSignUp = () => {
    // Redirect to sign up with return URL
    const returnUrl = encodeURIComponent('/join');
    router.push(`/auth/signup?redirect=${returnUrl}`);
  };

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
  if (joinStatus === 'success' && joinResult) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>{t('success.title')}</CardTitle>
            <CardDescription>
              {t('success.description', { org: joinResult.organization.name })}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">{t('success.redirecting')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>{t('code.title')}</CardTitle>
          <CardDescription>{t('code.description')}</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* Code input */}
            <div className="space-y-2">
              <Label htmlFor="code">{t('code.label')}</Label>
              <Input
                ref={inputRef}
                id="code"
                type="text"
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                placeholder={t('code.placeholder')}
                className="text-center text-2xl tracking-[0.5em] font-mono uppercase"
                maxLength={6}
                autoComplete="off"
                disabled={joinStatus === 'loading' || !isAuthenticated}
              />
              <p className="text-xs text-muted-foreground text-center">
                {t('code.hint')}
              </p>
            </div>

            {/* Error alert */}
            {joinError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t('code.errors.title')}</AlertTitle>
                <AlertDescription>{joinError}</AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            {isAuthenticated ? (
              // Authenticated user - show join button
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={!isCodeValid || joinStatus === 'loading'}
              >
                {joinStatus === 'loading' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('code.joining')}
                  </>
                ) : (
                  t('code.submit')
                )}
              </Button>
            ) : (
              // Not authenticated - show sign in/up options
              <>
                <div className="w-full text-center text-sm text-muted-foreground mb-2">
                  {t('code.authRequired')}
                </div>
                <Button type="button" className="w-full" size="lg" onClick={handleSignIn}>
                  <LogIn className="h-4 w-4 mr-2" />
                  {t('actions.signInToJoin')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  size="lg"
                  onClick={handleSignUp}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  {t('actions.signUpToJoin')}
                </Button>
              </>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
