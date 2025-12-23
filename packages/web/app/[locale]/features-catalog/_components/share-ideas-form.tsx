'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, CheckCircle2 } from 'lucide-react';

export function ShareIdeasForm() {
  const [ideaText, setIdeaText] = useState('');
  const [ideaContact, setIdeaContact] = useState('');
  const [ideaSubmitted, setIdeaSubmitted] = useState(false);

  return (
    <section id="share-ideas" className="py-20 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/30 via-gray-900 to-cyan-900/30" />
      
      <motion.div 
        className="max-w-4xl mx-auto relative z-10"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <div className="text-center mb-12">
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 rounded-full mb-6"
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-purple-400 text-sm font-medium">Ваше видение важно</span>
          </motion.div>
          
          <h2 className="text-4xl font-bold mb-4">
            <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Поделитесь своими идеями
            </span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Какие функции вы мечтаете увидеть в платформе будущего? 
            Мы собираем идеи для создания идеального решения для корпоративного обучения.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {!ideaSubmitted ? (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700"
            >
              <div className="space-y-6">
                <div>
                  <label htmlFor="idea" className="block text-sm font-medium text-gray-300 mb-2">
                    Опишите вашу идею
                  </label>
                  <textarea
                    id="idea"
                    value={ideaText}
                    onChange={(e) => setIdeaText(e.target.value)}
                    placeholder="Например: Было бы здорово, если бы платформа могла автоматически создавать персонализированные планы развития для каждого сотрудника..."
                    className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all resize-none"
                    rows={5}
                  />
                </div>

                <div>
                  <label htmlFor="contact" className="block text-sm font-medium text-gray-300 mb-2">
                    Как с вами связаться (опционально)
                  </label>
                  <input
                    id="contact"
                    type="text"
                    value={ideaContact}
                    onChange={(e) => setIdeaContact(e.target.value)}
                    placeholder="Email, Telegram или телефон"
                    className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
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
                            source: 'Features Catalog Page'
                          })
                        });

                        if (response.ok) {
                          setIdeaSubmitted(true);
                          // Clear form after successful submission
                          setIdeaText('');
                          setIdeaContact('');
                        } else {
                          // Handle error - show error message to user
                          alert('Произошла ошибка при отправке. Пожалуйста, попробуйте еще раз.');
                        }
                      } catch {
                        // Error is already logged on server side
                        alert('Произошла ошибка при отправке. Пожалуйста, попробуйте еще раз.');
                      }
                    }
                  }}
                  disabled={!ideaText.trim()}
                  className="w-full py-4 bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-semibold rounded-xl hover:shadow-2xl hover:shadow-purple-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="bg-gradient-to-br from-purple-900/30 to-cyan-900/30 backdrop-blur-sm rounded-2xl p-12 border border-purple-500/20 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="w-20 h-20 bg-gradient-to-br from-purple-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-6"
              >
                <CheckCircle2 className="w-10 h-10 text-white" />
              </motion.div>
              <h3 className="text-2xl font-bold text-white mb-2">Спасибо за вашу идею!</h3>
              <p className="text-gray-400">
                Мы ценим ваш вклад в создание будущего корпоративного обучения.
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setIdeaSubmitted(false);
                  setIdeaText('');
                  setIdeaContact('');
                }}
                className="mt-6 px-6 py-2 text-purple-400 hover:text-purple-300 transition-colors"
              >
                Поделиться ещё одной идеей
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
