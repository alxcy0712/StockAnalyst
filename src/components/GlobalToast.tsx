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

export function GlobalToast() {
  const { errors, removeError } = useErrorStore();

  if (errors.length === 0) return null;

  return createPortal(
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[1000] flex flex-col gap-2 pointer-events-none w-full max-w-lg px-4">
      <AnimatePresence mode="popLayout">
        {errors.map((error) => {
          const Icon = icons[error.type];
          return (
            <motion.div
              key={error.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className={`pointer-events-auto px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm ${styles[error.type]}`}
            >
              <div className="flex items-start gap-3">
                <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{error.message}</p>
                </div>
                <button
                  onClick={() => removeError(error.id)}
                  className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded transition-colors flex-shrink-0"
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
