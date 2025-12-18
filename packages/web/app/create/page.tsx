import CreatePageClientFull from './page-client-full'

// Force dynamic rendering to ensure auth state is fresh
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default function CreateCoursePage() {
  // This is now a server component that can handle auth properly
  // The client components are rendered inside
  return <CreatePageClientFull />
}