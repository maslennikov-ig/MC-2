import { Metadata } from "next"
import { setRequestLocale } from 'next-intl/server';
import { Locale } from '@/src/i18n/config';
import { Link } from '@/src/i18n/navigation'
import Logo from "@/components/common/logo"

export const metadata: Metadata = {
  title: "О платформе",
  description: "Узнайте больше о MegaCampusAI - инновационной платформе для автоматической генерации образовательных курсов с использованием искусственного интеллекта.",
  keywords: ["о платформе", "MegaCampusAI", "автоматизация обучения", "AI образование", "технологии"],
  openGraph: {
    title: "О платформе MegaCampusAI",
    description: "Узнайте больше о MegaCampusAI - инновационной платформе для автоматической генерации образовательных курсов",
    url: "/about",
    type: "website",
  },
  twitter: {
    title: "О платформе MegaCampusAI",
    description: "Узнайте больше о MegaCampusAI - инновационной платформе для автоматической генерации образовательных курсов",
  },
  alternates: {
    canonical: "/about",
  },
}

type Props = {
  params: Promise<{ locale: Locale }>;
};

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale); // Enable static rendering

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="container mx-auto px-4 py-16">
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="text-white/70 hover:text-white transition-colors">
            ← Назад
          </Link>
          <Logo variant="compact" size="md" />
        </div>

        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-white mb-8">О платформе MegaCampusAI</h1>
          
          <div className="prose prose-invert max-w-none">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-8 mb-8 border border-white/20">
              <h2 className="text-2xl font-semibold text-white mb-4">Что такое MegaCampusAI?</h2>
              <p className="text-white/80 mb-4">
                MegaCampusAI - это инновационная платформа для автоматической генерации образовательных курсов 
                с использованием искусственного интеллекта. Мы превращаем ваши документы и идеи в полноценные 
                учебные материалы за считанные минуты.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-8 mb-8 border border-white/20">
              <h2 className="text-2xl font-semibold text-white mb-4">Наши возможности</h2>
              <ul className="space-y-3 text-white/80">
                <li>✨ Автоматическая генерация структуры курса</li>
                <li>📝 Создание текстового контента на основе ваших документов</li>
                <li>🎙️ Генерация аудио-уроков с профессиональной озвучкой</li>
                <li>🎥 Создание видео-презентаций</li>
                <li>📊 Автоматические тесты и задания</li>
                <li>🤖 Интеграция с современными AI-моделями</li>
              </ul>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-8 mb-8 border border-white/20">
              <h2 className="text-2xl font-semibold text-white mb-4">Технологии</h2>
              <p className="text-white/80 mb-4">
                Платформа построена на основе передовых технологий:
              </p>
              <ul className="space-y-2 text-white/80">
                <li>• n8n для автоматизации рабочих процессов</li>
                <li>• OpenAI GPT и DeepSeek для генерации контента</li>
                <li>• Google Gemini для обработки документов</li>
                <li>• Supabase для хранения данных</li>
                <li>• Next.js для современного веб-интерфейса</li>
              </ul>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-8 border border-white/20">
              <h2 className="text-2xl font-semibold text-white mb-4">Контакты</h2>
              <p className="text-white/80">
                Есть вопросы или предложения? Свяжитесь с нами через Telegram-бота 
                или отправьте email на support@megacampus.ai
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}