/**
 * Career Playbook — reader-scoped share links
 * @module server/routers/career-playbook/view-share
 *
 * A role guide has three readers and the owner ruling of 2026-08-31 is that
 * they must not be able to open each other's: the employee sees only their own
 * guide, the manager also sees the employee's, HR sees the whole document.
 *
 * Nothing in the platform knows which of the three a given visitor is. The
 * roles it does have — admin, superadmin, instructor, student, and the
 * organization's owner/admin/manager — describe a seat in an organization, not
 * a position in the guide's cast, and the reader of a lead-magnet guide usually
 * has no account at all. So the link IS the credential: the owner sends each
 * reader a different one, and the server decides the view from the link rather
 * than from anything the client says.
 *
 * The token is derived rather than stored, which keeps this out of the shared
 * dev/staging database. Turning sharing off revokes all three at once, because
 * every read still requires the row to be public and completed — the same gate
 * the existing slug share passes through.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import type { CareerPlaybookAudience } from '@megacampus/shared-types';

import { getEnvWithDefault, getRequiredEnv } from '../../../shared/config/env-validator';

export const CAREER_PLAYBOOK_VIEW_AUDIENCES = ['employee', 'manager', 'hr'] as const;

/**
 * Domain separation, so a token can never be replayed as anything else derived
 * from the same key, and so rotating the scheme is a version bump.
 */
const TOKEN_DOMAIN = 'career-playbook-view-share:v1';

/** Long enough that guessing is hopeless, short enough to paste into a chat. */
const TOKEN_LENGTH = 32;

/**
 * The signing key.
 *
 * `CAREER_PLAYBOOK_SHARE_SECRET` when set, so the links can be rotated without
 * touching anything else. Otherwise the service key, which is server-only and
 * already required for every read this module gates: an HMAC never reveals its
 * key, and the domain prefix keeps the two uses apart.
 */
function signingKey(): string {
  return (
    getEnvWithDefault('CAREER_PLAYBOOK_SHARE_SECRET', '') || getRequiredEnv('SUPABASE_SERVICE_KEY')
  );
}

export function deriveCareerPlaybookViewToken(
  playbookId: string,
  audience: CareerPlaybookAudience
): string {
  return createHmac('sha256', signingKey())
    .update(`${TOKEN_DOMAIN}:${playbookId}:${audience}`)
    .digest('base64url')
    .slice(0, TOKEN_LENGTH);
}

/** Compare without leaking which character differed. */
function tokensMatch(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

/**
 * Which reader this link is for, or null when it is for none of them.
 *
 * Every candidate is compared even after a match, so the answer takes the same
 * work whichever reader it is.
 */
export function resolveCareerPlaybookViewAudience(
  playbookId: string,
  token: string
): CareerPlaybookAudience | null {
  let matched: CareerPlaybookAudience | null = null;

  for (const audience of CAREER_PLAYBOOK_VIEW_AUDIENCES) {
    if (tokensMatch(deriveCareerPlaybookViewToken(playbookId, audience), token)) {
      matched = audience;
    }
  }

  return matched;
}

export interface CareerPlaybookViewLink {
  audience: CareerPlaybookAudience;
  token: string;
  path: string;
}

/** The three links an owner hands out, one per reader. */
export function buildCareerPlaybookViewLinks(playbookId: string): CareerPlaybookViewLink[] {
  return CAREER_PLAYBOOK_VIEW_AUDIENCES.map(audience => {
    const token = deriveCareerPlaybookViewToken(playbookId, audience);
    return {
      audience,
      token,
      path: `/career-playbook/view/${playbookId}/${token}`,
    };
  });
}
