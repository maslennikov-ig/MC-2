'use client'

import { ErrorState } from '@/components/common/error-states'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorState error={error} reset={reset} variant="fullpage" />
}
