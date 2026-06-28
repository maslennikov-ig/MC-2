import { describe, expect, it } from 'vitest'

import { normalizeVisibilityUpdateResponse } from '@/components/career-playbook/library/normalizers'

describe('Career Playbook library normalizers', () => {
  it('normalizes visibility update responses with viewer permissions', () => {
    expect(
      normalizeVisibilityUpdateResponse({
        playbookId: 'pb-1',
        isPublic: true,
        visibility: 'public',
        shareSlug: 'head-of-sales',
        organizationSlug: 'mega-campus',
        viewerPermissions: {
          canEdit: true,
          canManageVisibility: true,
          canCreateCourse: false,
          canDelete: true,
        },
      })
    ).toEqual({
      playbookId: 'pb-1',
      isPublic: true,
      visibility: 'public',
      shareSlug: 'head-of-sales',
      organizationSlug: 'mega-campus',
      viewerPermissions: {
        canEdit: true,
        canManageVisibility: true,
        canCreateCourse: false,
        canDelete: true,
      },
    })
  })

  it('rejects malformed visibility update responses instead of partially hydrating state', () => {
    expect(
      normalizeVisibilityUpdateResponse({
        playbookId: 'pb-1',
        isPublic: true,
        visibility: 'team',
        shareSlug: 'head-of-sales',
      })
    ).toBeNull()

    expect(
      normalizeVisibilityUpdateResponse({
        playbookId: 'pb-1',
        isPublic: true,
        visibility: 'public',
        viewerPermissions: {
          canEdit: true,
          canManageVisibility: true,
        },
      })
    ).toMatchObject({
      playbookId: 'pb-1',
      viewerPermissions: null,
    })
  })
})
