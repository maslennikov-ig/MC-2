'use client'

import { createTRPCReact } from '@trpc/react-query'
import type { AppRouter } from '@megacampus/course-gen-platform/app-router'

export const trpc = createTRPCReact<AppRouter>()

/**
 * Re-export AppRouter type for use in server-side tRPC caller
 */
export type { AppRouter }
