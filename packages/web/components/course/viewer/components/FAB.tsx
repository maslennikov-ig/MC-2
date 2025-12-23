import React from "react"
import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"

interface FABProps {
  showFab: boolean;
  onOpenPanel: () => void;
}

export function FAB({ showFab, onOpenPanel }: FABProps) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ 
        scale: showFab ? 1 : 0.8,
        opacity: showFab ? 1 : 0,
        y: showFab ? 0 : 100
      }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", damping: 20, stiffness: 300 }}
      className="fixed bottom-8 right-8 z-50 pointer-events-auto"
      style={{ pointerEvents: showFab ? 'auto' : 'none' }}
    >
      <motion.button
        onClick={onOpenPanel}
        className="group relative bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-300 backdrop-blur-sm overflow-visible"
        whileHover={{ scale: 1.1, rotate: 90 }}
        whileTap={{ scale: 0.95 }}
        title="Генерировать контент с ИИ"
      >
        <Sparkles className="w-6 h-6 relative z-10" />
        
        <motion.span 
          className="absolute -inset-1 rounded-full bg-purple-600"
          initial={{ scale: 1, opacity: 0.75 }}
          animate={{ 
            scale: [1, 2, 1],
            opacity: [0.75, 0, 0.75]
          }}
          transition={{
            duration: 1,
            times: [0, 0.75, 1],
            repeat: 2,
            repeatDelay: 0.2
          }}
        />
        <motion.span 
          className="absolute -inset-1 rounded-full bg-purple-600 opacity-0 group-hover:opacity-75"
          animate={{
            scale: [1, 2],
            opacity: [0, 0]
          }}
          whileHover={{
            scale: [1, 2],
            opacity: [0.75, 0],
            transition: {
              duration: 1,
              repeat: Infinity,
              repeatDelay: 0.2
            }
          }}
        />
        
        <motion.div
          initial={{ opacity: 0, x: 10 }}
          whileHover={{ opacity: 1, x: 0 }}
          className="absolute right-full mr-3 top-1/2 -translate-y-1/2 pointer-events-none"
        >
          <div className="bg-gray-900 text-white text-sm px-3 py-2 rounded-lg whitespace-nowrap shadow-lg">
            <div className="font-semibold">Генерация контента</div>
            <div className="text-xs text-gray-300 mt-0.5">Создать материалы с ИИ</div>
            <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45" />
          </div>
        </motion.div>
      </motion.button>
    </motion.div>
  );
}
