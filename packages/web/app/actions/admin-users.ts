'use server';

import { getBackendAuthHeaders, TRPC_URL } from '@/lib/auth';
import type { Role } from '@megacampus/shared-types';

export interface ListUsersParams {
  limit?: number;
  offset?: number;
  search?: string;
  role?: string;
  isActive?: boolean;
  organizationId?: string;
}

export interface UpdateUserRoleParams {
  userId: string;
  role: 'student' | 'instructor' | 'admin';
}

export interface ToggleUserActivationParams {
  userId: string;
  isActive: boolean;
}

/** Re-export Role type from shared-types for consumers */
export type { Role as UserRole };

export interface UserListItem {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  organizationId: string;
  organizationName: string;
  createdAt: string;
  updatedAt: string | null;
}

export async function listUsersAction(params: ListUsersParams): Promise<{ users: UserListItem[]; totalCount: number }> {
  const headers = await getBackendAuthHeaders();

  const queryInput: Record<string, unknown> = {
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  };

  if (params.search) queryInput.search = params.search;
  if (params.role && params.role !== 'all') queryInput.role = params.role;
  if (params.isActive !== undefined) queryInput.isActive = params.isActive;
  if (params.organizationId) queryInput.organizationId = params.organizationId;

  const query = encodeURIComponent(JSON.stringify(queryInput));

  try {
    const res = await fetch(`${TRPC_URL}/admin.listUsers?input=${query}`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('List users fetch failed:', text);
      throw new Error(`Failed to fetch users: ${res.statusText}`);
    }

    const json = await res.json();

    if (json.error) {
      throw new Error(json.error.message);
    }

    // Backend returns { users, totalCount } format
    return json.result.data as { users: UserListItem[]; totalCount: number };
  } catch (error) {
    console.error('List Users Server Action Error:', error);
    throw error;
  }
}

export async function updateUserRoleAction(params: UpdateUserRoleParams) {
  const headers = await getBackendAuthHeaders();

  try {
    const res = await fetch(`${TRPC_URL}/admin.updateUserRole`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Update user role failed:', text);
      throw new Error(`Failed to update user role: ${res.statusText}`);
    }

    const json = await res.json();

    if (json.error) {
      throw new Error(json.error.message);
    }

    return json.result.data;
  } catch (error) {
    console.error('Update User Role Server Action Error:', error);
    throw error;
  }
}

export async function toggleUserActivationAction(params: ToggleUserActivationParams) {
  const headers = await getBackendAuthHeaders();

  try {
    const res = await fetch(`${TRPC_URL}/admin.toggleUserActivation`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Toggle user activation failed:', text);
      throw new Error(`Failed to toggle user activation: ${res.statusText}`);
    }

    const json = await res.json();

    if (json.error) {
      throw new Error(json.error.message);
    }

    return json.result.data;
  } catch (error) {
    console.error('Toggle User Activation Server Action Error:', error);
    throw error;
  }
}
