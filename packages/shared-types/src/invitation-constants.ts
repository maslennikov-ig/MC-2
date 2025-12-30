/**
 * Invitation expiration options
 */
export const INVITATION_EXPIRATION_OPTIONS = {
  '1day': { days: 1, labelKey: 'invitations.expiration.options.1day' },
  '7days': { days: 7, labelKey: 'invitations.expiration.options.7days' },
  '30days': { days: 30, labelKey: 'invitations.expiration.options.30days' },
  never: { days: null, labelKey: 'invitations.expiration.options.never' },
} as const;

export type InvitationExpirationOption = keyof typeof INVITATION_EXPIRATION_OPTIONS;

/**
 * Maximum uses options for link/code invitations
 */
export const INVITATION_MAX_USES_OPTIONS = [1, 5, 10, 25, 50, 100] as const;

/**
 * Invitation code length (8 chars provides ~40 bits entropy)
 */
export const INVITATION_CODE_LENGTH = 8;

/**
 * Invitation token prefix
 */
export const INVITATION_TOKEN_PREFIX = 'inv_';

/**
 * Maximum emails per bulk invitation request
 */
export const INVITATION_BULK_MAX_EMAILS = 100;
