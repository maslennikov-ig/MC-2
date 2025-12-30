import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/src/i18n/config';
import { JoinOrganizationClient } from './client';

// Force dynamic rendering to ensure fresh invitation data
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    locale: Locale;
    token: string;
  }>;
}

/**
 * Fetch invitation details from API
 * Uses internal API route which handles admin client access
 */
async function getInvitationByToken(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    const response = await fetch(`${baseUrl}/api/invitations/${token}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        data: null,
        error: {
          status: response.status,
          message: errorData.message || 'Failed to fetch invitation',
        },
      };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        status: 500,
        message: error instanceof Error ? error.message : 'Network error',
      },
    };
  }
}

/**
 * Join Organization by Token Page
 *
 * Server component that fetches invitation details and renders the client UI.
 * Handles invalid/expired tokens with appropriate error messages.
 */
export default async function JoinByTokenPage({ params }: PageProps) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  // Validate token format (basic check)
  if (!token || token.length < 10) {
    notFound();
  }

  // Fetch invitation details
  const { data, error } = await getInvitationByToken(token);

  // Handle errors
  if (error) {
    // For 404 or 410 (gone), show not found
    if (error.status === 404 || error.status === 410) {
      return (
        <JoinOrganizationClient
          token={token}
          invitation={null}
          organization={null}
          errorType={error.status === 410 ? 'expired' : 'not_found'}
          errorMessage={error.message}
        />
      );
    }

    // For other errors, show generic error state
    return (
      <JoinOrganizationClient
        token={token}
        invitation={null}
        organization={null}
        errorType="error"
        errorMessage={error.message}
      />
    );
  }

  // Pass data to client component
  return (
    <JoinOrganizationClient
      token={token}
      invitation={data.invitation}
      organization={data.organization}
    />
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { locale, token } = await params;
  const t = await getTranslations({ locale, namespace: 'organizations.join' });

  // Fetch invitation for metadata
  const { data } = await getInvitationByToken(token);

  if (!data) {
    return {
      title: t('title'),
    };
  }

  return {
    title: t('metaTitle', { org: data.organization.name }),
    description: t('metaDescription', { org: data.organization.name }),
  };
}
