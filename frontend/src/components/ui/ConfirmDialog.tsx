"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning" | "default";
  onConfirm: () => void;
  onCancel: () => void;
};

const TONE_BUTTON: Record<NonNullable<ConfirmDialogProps["tone"]>, string> = {
  danger: "pixel-button-emergency",
  warning: "pixel-button-success",
  default: "pixel-button",
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "CONFIRM",
  cancelLabel = "CANCEL",
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Close on Escape key.
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      if (event.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel, onConfirm]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4"
          onClick={onCancel}
        >
          <motion.div
            key="dialog"
            initial={{ scale: 0.85, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.85, y: 30, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#fff8ea] border-4 border-[var(--brown)] max-w-md w-full p-6 shadow-[0_8px_0_#5c4427]"
          >
            <h2 className="pixel-text text-lg text-[#5c4427] mb-3">{title}</h2>
            <p className="pixel-small text-[#5c4427] leading-relaxed mb-5">{message}</p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onCancel}
                className="pixel-button text-xs px-4"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`pixel-button ${TONE_BUTTON[tone]} text-xs px-4`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
