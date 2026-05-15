"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

export type ToastTone = "info" | "success" | "danger" | "achievement";

export type Toast = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  icon?: string;
  durationMs: number;
};

type ToastInput = Omit<Toast, "id" | "durationMs"> & { durationMs?: number };

type ToastContextValue = {
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, string> = {
  info: "bg-[#fff8ea] border-[var(--brown)] text-[#5c4427]",
  success: "bg-[var(--status-success-bg)] border-[var(--status-success-border)] text-[#0f5132]",
  danger: "bg-[var(--status-error-bg)] border-[var(--status-error-border)] text-[#5c0a0a]",
  achievement:
    "bg-gradient-to-br from-[#ffe9a8] via-[#ffc870] to-[#ffae3b] border-[#8b5a2b] text-[#3d2710] shadow-[0_4px_0_#5c4427]",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const duration = input.durationMs ?? (input.tone === "achievement" ? 5000 : 3500);
      const toast: Toast = { id, durationMs: duration, ...input };
      setToasts((prev) => [...prev, toast]);
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  // Cleanup all timers on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] pointer-events-none flex flex-col gap-2 max-w-[360px]">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 80, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.85 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className={`pointer-events-auto border-4 px-4 py-3 ${TONE_STYLES[toast.tone]}`}
            >
              <div className="flex items-start gap-2">
                {toast.icon ? (
                  <span className="text-2xl leading-none shrink-0">{toast.icon}</span>
                ) : null}
                <div className="flex-1 min-w-0">
                  <p className="pixel-small font-bold leading-tight">{toast.title}</p>
                  {toast.description ? (
                    <p className="pixel-small mt-1 opacity-80 leading-snug">
                      {toast.description}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="pixel-small opacity-60 hover:opacity-100 shrink-0"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      push: () => "",
      dismiss: () => {},
    } as ToastContextValue;
  }
  return ctx;
}
