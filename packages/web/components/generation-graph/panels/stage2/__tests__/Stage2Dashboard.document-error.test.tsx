import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Stage2Dashboard, type Stage2DashboardData } from '../Stage2Dashboard'

const messages: Record<string, string> = {
  'stage2.unreadableTextLayer':
    'В файле нет текста, который можно выделить и прочитать. Загрузите версию с текстовым слоем или сначала распознайте текст на скане или изображении.',
  'stage2.genericProcessingFailure':
    'Не удалось обработать этот файл. Проверьте, что он открывается, или загрузите другую версию.',
}

vi.mock('next-intl', () => ({
  useLocale: () => 'ru',
  useTranslations: () => (key: string) => messages[key] ?? key,
}))

function failedDashboard(errorMessage?: string): Stage2DashboardData {
  return {
    totalDocuments: 1,
    completedDocuments: 0,
    processingDocuments: 0,
    failedDocuments: 1,
    documents: [
      {
        documentId: 'file-1',
        filename: 'Схема процесса.pdf',
        status: 'error',
        priority: 'CORE',
        completedStages: 0,
        totalStages: 7,
        processingTimeMs: 48_213,
        errorMessage,
      },
    ],
    aggregates: {
      totalPages: 0,
      totalChunks: 0,
      totalTokens: 0,
      avgProcessingTimeMs: 48_213,
    },
  }
}

describe('Stage2Dashboard document failure reason', () => {
  it('turns an empty text-layer failure into localized recovery guidance without backend details', () => {
    render(
      <Stage2Dashboard
        data={failedDashboard(
          'Conversion produced no usable text for /tmp/private/diagram.pdf: 12 characters. It carries no extractable text layer: either a scan, or a diagram whose type was converted to curves.'
        )}
      />
    )

    expect(screen.getByText(messages['stage2.unreadableTextLayer'])).toBeInTheDocument()
    expect(screen.queryByText(/\/tmp\/private/)).not.toBeInTheDocument()
    expect(screen.queryByText(/12 characters/)).not.toBeInTheDocument()
  })

  it('shows a safe generic explanation for an unrecognized stored failure', () => {
    render(
      <Stage2Dashboard
        data={failedDashboard(
          '<script>alert(1)</script> Internal worker failed at /srv/coursegen/private/file.pdf'
        )}
      />
    )

    expect(screen.getByText(messages['stage2.genericProcessingFailure'])).toBeInTheDocument()
    expect(screen.queryByText(/Internal worker/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\/srv\/coursegen/)).not.toBeInTheDocument()
  })
})
