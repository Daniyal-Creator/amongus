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

export type SoundName =
  | "click"
  | "success"
  | "fail"
  | "emergency"
  | "victory"
  | "defeat"
  | "tick"
  | "notify"
  | "eject";

const SOUND_FILES: Record<SoundName, string> = {
  click: "/sounds/click.mp3",
  success: "/sounds/success.mp3",
  fail: "/sounds/fail.mp3",
  emergency: "/sounds/emergency.mp3",
  victory: "/sounds/victory.mp3",
  defeat: "/sounds/defeat.mp3",
  tick: "/sounds/tick.mp3",
  notify: "/sounds/notify.mp3",
  eject: "/sounds/eject.mp3",
};

type SoundContextValue = {
  play: (name: SoundName, options?: { volume?: number }) => void;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  volume: number;
  setVolume: (volume: number) => void;
};

const SoundContext = createContext<SoundContextValue | null>(null);

const STORAGE_KEY_MUTED = "code-mafia.audio.muted";
const STORAGE_KEY_VOLUME = "code-mafia.audio.volume";

export function SoundProvider({ children }: { children: ReactNode }) {
  const [muted, setMutedState] = useState(false);
  const [volume, setVolumeState] = useState(0.6);
  const audioCache = useRef<Map<SoundName, HTMLAudioElement>>(new Map());
  const missingFiles = useRef<Set<SoundName>>(new Set());

  // Hydrate persisted preferences after mount.
  useEffect(() => {
    try {
      const m = localStorage.getItem(STORAGE_KEY_MUTED);
      if (m === "1") setMutedState(true);
      const v = localStorage.getItem(STORAGE_KEY_VOLUME);
      if (v) {
        const parsed = Number(v);
        if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          setVolumeState(parsed);
        }
      }
    } catch {
      // ignore (private mode etc.)
    }
  }, []);

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    try {
      localStorage.setItem(STORAGE_KEY_MUTED, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const setVolume = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    setVolumeState(clamped);
    try {
      localStorage.setItem(STORAGE_KEY_VOLUME, String(clamped));
    } catch {
      /* ignore */
    }
  }, []);

  const play = useCallback(
    (name: SoundName, options?: { volume?: number }) => {
      if (muted) return;
      if (missingFiles.current.has(name)) return;

      let audio = audioCache.current.get(name);
      if (!audio) {
        audio = new Audio(SOUND_FILES[name]);
        audio.preload = "auto";
        audio.addEventListener("error", () => {
          // File missing or unsupported — remember and never try again this session.
          missingFiles.current.add(name);
        });
        audioCache.current.set(name, audio);
      }
      audio.volume = (options?.volume ?? 1) * volume;
      // Restart from beginning so repeated rapid clicks don't queue up silence.
      try {
        audio.currentTime = 0;
        const promise = audio.play();
        if (promise && typeof promise.catch === "function") {
          promise.catch(() => {
            // Autoplay blocked or file missing — silent fallback.
          });
        }
      } catch {
        /* ignore */
      }
    },
    [muted, volume],
  );

  const value = useMemo(
    () => ({ play, muted, setMuted, volume, setVolume }),
    [play, muted, setMuted, volume, setVolume],
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSounds() {
  const ctx = useContext(SoundContext);
  if (!ctx) {
    // Provider missing → return no-op so unwrapped trees don't crash.
    return {
      play: () => {},
      muted: true,
      setMuted: () => {},
      volume: 0,
      setVolume: () => {},
    } as SoundContextValue;
  }
  return ctx;
}
