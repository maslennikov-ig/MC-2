/**
 * Root layout - minimal passthrough for next-intl [locale] routing
 * Actual layout implementation is in app/[locale]/layout.tsx
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
