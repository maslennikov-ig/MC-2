// Force dynamic rendering for this debug page
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function Stage5ChatDebugLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
