/**
 * Reader-scoped share links.
 *
 * Owner ruling 2026-08-31: the employee must not be able to open the manager's
 * guide. Nothing in the platform knows which of the three readers a visitor is
 * — its roles describe a seat in an organization, and a lead-magnet reader has
 * no account at all — so the link is the credential and the server decides the
 * view from it.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildCareerPlaybookViewLinks,
  deriveCareerPlaybookViewToken,
  resolveCareerPlaybookViewAudience,
} from '@/server/routers/career-playbook/view-share';

const PLAYBOOK = '88fc2368-58c4-469d-a8d4-ab2246598bfc';
const OTHER = '638ed691-aed9-4954-a9ac-cf592c87536b';

beforeAll(() => {
  process.env.CAREER_PLAYBOOK_SHARE_SECRET = 'test-secret-for-view-share';
});

describe('career playbook view share tokens', () => {
  it('gives each reader a different token, and the same one every time', () => {
    const employee = deriveCareerPlaybookViewToken(PLAYBOOK, 'employee');
    const manager = deriveCareerPlaybookViewToken(PLAYBOOK, 'manager');
    const hr = deriveCareerPlaybookViewToken(PLAYBOOK, 'hr');

    expect(new Set([employee, manager, hr]).size).toBe(3);
    expect(deriveCareerPlaybookViewToken(PLAYBOOK, 'employee')).toBe(employee);
  });

  it('does not carry a token from one playbook to another', () => {
    expect(deriveCareerPlaybookViewToken(PLAYBOOK, 'employee')).not.toBe(
      deriveCareerPlaybookViewToken(OTHER, 'employee')
    );
    expect(
      resolveCareerPlaybookViewAudience(OTHER, deriveCareerPlaybookViewToken(PLAYBOOK, 'employee'))
    ).toBeNull();
  });

  it('resolves a link back to exactly the reader it was issued for', () => {
    for (const audience of ['employee', 'manager', 'hr'] as const) {
      const token = deriveCareerPlaybookViewToken(PLAYBOOK, audience);
      expect(resolveCareerPlaybookViewAudience(PLAYBOOK, token)).toBe(audience);
    }
  });

  it('refuses anything that is not one of the three', () => {
    expect(resolveCareerPlaybookViewAudience(PLAYBOOK, '')).toBeNull();
    expect(resolveCareerPlaybookViewAudience(PLAYBOOK, 'not-a-token')).toBeNull();
    // One character short of the employee token: a prefix must not pass.
    const employee = deriveCareerPlaybookViewToken(PLAYBOOK, 'employee');
    expect(resolveCareerPlaybookViewAudience(PLAYBOOK, employee.slice(0, -1))).toBeNull();
  });

  it('rotates every link when the secret changes', () => {
    const before = deriveCareerPlaybookViewToken(PLAYBOOK, 'hr');
    process.env.CAREER_PLAYBOOK_SHARE_SECRET = 'rotated-secret';
    const after = deriveCareerPlaybookViewToken(PLAYBOOK, 'hr');
    process.env.CAREER_PLAYBOOK_SHARE_SECRET = 'test-secret-for-view-share';

    expect(after).not.toBe(before);
    expect(resolveCareerPlaybookViewAudience(PLAYBOOK, after)).toBeNull();
  });

  it('builds one path per reader, with the token in it', () => {
    const links = buildCareerPlaybookViewLinks(PLAYBOOK);

    expect(links.map(link => link.audience)).toEqual(['employee', 'manager', 'hr']);
    for (const link of links) {
      expect(link.path).toBe(`/career-playbook/view/${PLAYBOOK}/${link.token}`);
      expect(resolveCareerPlaybookViewAudience(PLAYBOOK, link.token)).toBe(link.audience);
    }
  });
});
