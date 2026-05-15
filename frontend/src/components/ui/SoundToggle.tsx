"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { useSounds } from "@/lib/sound-provider";

type SoundToggleProps = {
  className?: string;
};

export function SoundToggle({ className = "" }: SoundToggleProps) {
  const { muted, setMuted, play } = useSounds();

  return (
    <button
      type="button"
      onClick={() => {
        const next = !muted;
        setMuted(next);
        if (!next) play("click");
      }}
      className={`pixel-button text-xs px-2 py-1 inline-flex items-center justify-center gap-1 ${className}`}
      title={muted ? "Unmute sounds" : "Mute sounds"}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
    >
      <AnimatePresence mode="wait" initial={false}>
        {muted ? (
          <motion.span
            key="mute"
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 45 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
          >
            <VolumeX className="w-4 h-4" />
          </motion.span>
        ) : (
          <motion.span
            key="vol"
            initial={{ scale: 0, rotate: 45 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: -45 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
          >
            <Volume2 className="w-4 h-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
