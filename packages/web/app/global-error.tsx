'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Detect browser language - works without React context
  const isRussian = typeof window !== 'undefined' &&
    (navigator.language.startsWith('ru') ||
     document.documentElement.lang === 'ru' ||
     window.location.pathname.startsWith('/ru'))

  const text = isRussian ? {
    title: 'Критическая ошибка',
    message: 'Произошла серьёзная ошибка. Попробуйте обновить страницу.',
    button: 'Попробовать снова'
  } : {
    title: 'Critical Error',
    message: 'A serious error occurred. Please try refreshing the page.',
    button: 'Try Again'
  }

  return (
    <html lang={isRussian ? 'ru' : 'en'}>
      <body style={{
        margin: 0,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #581c87 50%, #1e1b4b 100%)',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          borderRadius: '16px',
          padding: '48px',
          maxWidth: '400px',
          textAlign: 'center',
          color: 'white',
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            fontSize: '32px',
          }}>
            ⚠️
          </div>
          <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>
            {text.title}
          </h1>
          <p style={{ opacity: 0.8, marginBottom: '24px' }}>
            {text.message}
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {text.button}
          </button>
        </div>
      </body>
    </html>
  )
}
