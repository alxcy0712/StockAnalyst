import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useErrorStore } from '../stores/errorStore';

const icons = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles = {
  error: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
  warning: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200',
  info: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
};

const iconStyles = {
  error: 'text-red-500 dark:text-red-400',
  warning: 'text-amber-500 dark:text-amber-400',
  info: 'text-blue-500 dark:text-blue-400',
};

export function GlobalToast() {
  const { errors, removeError } = useErrorStore();

  if (errors.length === 0) return null;

  return createPortal(
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[1000] flex flex-col gap-3 pointer-events-none w-full max-w-md px-4">
      <AnimatePresence mode="popLayout">
        {errors.map((error) => {
          const Icon = icons[error.type];
          return (
            <motion.div
              key={error.id}
              layout
              initial={{ opacity: 0, y: -24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{
                duration: 0.24,
                ease: [0.25, 0.1, 0.25, 1.0],
              }}
              className={`pointer-events-auto px-5 py-4 rounded-2xl border shadow-2xl backdrop-blur-xl ${styles[error.type]}`}
            >
              <div className="flex items-start gap-4">
                <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${iconStyles[error.type]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-relaxed">{error.message}</p>
                </div>
                <button
                  onClick={() => removeError(error.id)}
                  className="p-1.5 -mr-2 -mt-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors flex-shrink-0 opacity-60 hover:opacity-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body
  );
}
