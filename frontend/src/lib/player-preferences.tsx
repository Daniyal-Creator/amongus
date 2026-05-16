"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeId = 1 | 2 | 3 | 4;

export type PlayerPreferences = {
  reduceEffects: boolean;
  compactUi: boolean;
  theme: ThemeId;
};

type PlayerPreferencesContextValue = PlayerPreferences & {
  setReduceEffects: (next: boolean) => void;
  setCompactUi: (next: boolean) => void;
  setTheme: (next: ThemeId) => void;
};

const STORAGE_KEY = "code-mafia.player-preferences";

const DEFAULT_PREFERENCES: PlayerPreferences = {
  reduceEffects: false,
  compactUi: false,
  theme: 1,
};

const PlayerPreferencesContext = createContext<PlayerPreferencesContextValue | null>(null);

export function PlayerPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<PlayerPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<PlayerPreferences>;
        const theme = ([1, 2, 3, 4] as ThemeId[]).includes(parsed.theme as ThemeId)
          ? (parsed.theme as ThemeId)
          : 1;
        setPreferences({
          reduceEffects: Boolean(parsed.reduceEffects),
          compactUi: Boolean(parsed.compactUi),
          theme,
        });
      } catch {
        /* ignore corrupted preferences */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("low-effects-mode", preferences.reduceEffects);
    document.body.classList.toggle("compact-ui-mode", preferences.compactUi);
    document.body.style.setProperty(
      "--sky-bg-url",
      `url('/background/nature_${preferences.theme}/origbig.png')`,
    );
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      /* ignore storage failures */
    }
  }, [preferences]);

  const setReduceEffects = useCallback((next: boolean) => {
    setPreferences((current) => ({ ...current, reduceEffects: next }));
  }, []);

  const setCompactUi = useCallback((next: boolean) => {
    setPreferences((current) => ({ ...current, compactUi: next }));
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    setPreferences((current) => ({ ...current, theme: next }));
  }, []);

  const value = useMemo(
    () => ({
      ...preferences,
      setReduceEffects,
      setCompactUi,
      setTheme,
    }),
    [preferences, setCompactUi, setReduceEffects, setTheme],
  );

  return (
    <PlayerPreferencesContext.Provider value={value}>
      {children}
    </PlayerPreferencesContext.Provider>
  );
}

export function usePlayerPreferences() {
  const context = useContext(PlayerPreferencesContext);
  if (!context) {
    return {
      ...DEFAULT_PREFERENCES,
      setReduceEffects: () => {},
      setCompactUi: () => {},
      setTheme: () => {},
    } as PlayerPreferencesContextValue;
  }
  return context;
}
