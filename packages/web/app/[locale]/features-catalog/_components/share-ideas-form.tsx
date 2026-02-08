'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, CheckCircle2 } from 'lucide-react'

export function ShareIdeasForm() {
  const [ideaText, setIdeaText] = useState('')
  const [ideaContact, setIdeaContact] = useState('')
  const [ideaSubmitted, setIdeaSubmitted] = useState(false)

  return (
    <section id="share-ideas" className="relative overflow-hidden px-4 py-20">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/30 via-gray-900 to-cyan-900/30" />

      <motion.div
        className="relative z-10 mx-auto max-w-4xl"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <div className="mb-12 text-center">
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            className="mb-6 inline-flex items-center gap-2 rounded-full bg-purple-500/10 px-4 py-2"
          >
            <Sparkles className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium text-purple-400">Ваше видение важно</span>
          </motion.div>

          <h2 className="mb-4 text-4xl font-bold">
            <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Поделитесь своими идеями
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-gray-400">
            Какие функции вы мечтаете увидеть в платформе будущего? Мы собираем идеи для создания
            идеального решения для корпоративного обучения.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {!ideaSubmitted ? (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-gray-700 bg-gray-800/50 p-8 backdrop-blur-sm"
            >
              <div className="space-y-6">
                <div>
                  <label htmlFor="idea" className="mb-2 block text-sm font-medium text-gray-300">
                    Опишите вашу идею
                  </label>
                  <textarea
                    id="idea"
                    value={ideaText}
                    onChange={(e) => setIdeaText(e.target.value)}
                    placeholder="Например: Было бы здорово, если бы платформа могла автоматически создавать персонализированные планы развития для каждого сотрудника..."
                    className="w-full resize-none rounded-xl border border-gray-700 bg-gray-900/50 px-4 py-3 text-white placeholder-gray-500 transition-all focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none"
                    rows={5}
                  />
                </div>

                <div>
                  <label htmlFor="contact" className="mb-2 block text-sm font-medium text-gray-300">
                    Как с вами связаться (опционально)
                  </label>
                  <input
                    id="contact"
                    type="text"
                    value={ideaContact}
                    onChange={(e) => setIdeaContact(e.target.value)}
                    placeholder="Email, Telegram или телефон"
                    className="w-full rounded-xl border border-gray-700 bg-gray-900/50 px-4 py-3 text-white placeholder-gray-500 transition-all focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none"
                  />
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={async () => {
                    if (ideaText.trim()) {
                      try {
                        // Send to Telegram via our API
                        const response = await fetch('/api/telegram/send-idea', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            idea: ideaText,
                            contact: ideaContact,
                            source: 'Features Catalog Page',
                          }),
                        })

                        if (response.ok) {
                          setIdeaSubmitted(true)
                          // Clear form after successful submission
                          setIdeaText('')
                          setIdeaContact('')
                        } else {
                          // Handle error - show error message to user
                          alert('Произошла ошибка при отправке. Пожалуйста, попробуйте еще раз.')
                        }
                      } catch {
                        // Error is already logged on server side
                        alert('Произошла ошибка при отправке. Пожалуйста, попробуйте еще раз.')
                      }
                    }
                  }}
                  disabled={!ideaText.trim()}
                  className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 py-4 font-semibold text-white transition-all hover:shadow-2xl hover:shadow-purple-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Отправить идею
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-900/30 to-cyan-900/30 p-12 text-center backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-cyan-500"
              >
                <CheckCircle2 className="h-10 w-10 text-white" />
              </motion.div>
              <h3 className="mb-2 text-2xl font-bold text-white">Спасибо за вашу идею!</h3>
              <p className="text-gray-400">
                Мы ценим ваш вклад в создание будущего корпоративного обучения.
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setIdeaSubmitted(false)
                  setIdeaText('')
                  setIdeaContact('')
                }}
                className="mt-6 px-6 py-2 text-purple-400 transition-colors hover:text-purple-300"
              >
                Поделиться ещё одной идеей
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </section>
  )
}
