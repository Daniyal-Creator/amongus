"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSounds } from "@/lib/sound-provider";

type CopyButtonProps = {
  value: string;
  label?: string;
  className?: string;
  size?: "sm" | "md";
};

export function CopyButton({ value, label, className = "", size = "md" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const { play } = useSounds();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      play("click");
    } catch {
      // Fallback: select text in a hidden textarea.
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        play("click");
      } catch {
        /* ignore */
      } finally {
        document.body.removeChild(textarea);
      }
    }
  }, [value, play]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  const iconSize = size === "sm" ? "w-3 h-3" : "w-4 h-4";

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`pixel-button text-xs px-3 inline-flex items-center gap-2 relative overflow-hidden ${className}`}
      aria-label="Copy lobby code"
    >
      <span className="relative w-4 h-4 inline-block">
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.span
              key="check"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Check className={iconSize} />
            </motion.span>
          ) : (
            <motion.span
              key="copy"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Copy className={iconSize} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={copied ? "copied" : "copy-text"}
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -6, opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {copied ? "COPIED!" : label ?? "COPY"}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
