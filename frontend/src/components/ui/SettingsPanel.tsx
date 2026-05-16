"use client";

import Image from "next/image";
import { useState } from "react";
import { usePlayerPreferences, type ThemeId } from "@/lib/player-preferences";
import { useSounds } from "@/lib/sound-provider";

function PixelGearIcon() {
  return (
    <span className="relative block shrink-0" style={{ width: 44, height: 44 }}>
      <Image
        src="/gear.png"
        alt=""
        fill
        sizes="44px"
        className="object-contain [image-rendering:pixelated]"
        priority
        unoptimized
      />
    </span>
  );
}

const THEMES: { id: ThemeId; label: string; preview: string }[] = [
  { id: 1, label: "Forest", preview: "/background/nature_1/origbig.png" },
  { id: 2, label: "Meadow", preview: "/background/nature_2/origbig.png" },
  { id: 3, label: "Mountain", preview: "/background/nature_3/origbig.png" },
  { id: 4, label: "Pine", preview: "/background/nature_4/origbig.png" },
];

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const { reduceEffects, compactUi, theme, setReduceEffects, setCompactUi, setTheme } = usePlayerPreferences();
  const { muted, setMuted, play } = useSounds();

  function toggleOpen() {
    play("click");
    setOpen((current) => !current);
  }

  return (
    <div className="fixed right-4 top-4 z-30">
      <button
        type="button"
        onClick={toggleOpen}
        className="pixel-button pixel-button-primary flex h-[62px] w-[62px] items-center justify-center border-[6px] px-0 shadow-[0_5px_0_#6d470c,0_10px_12px_rgba(0,0,0,0.35)]"
        aria-label="Open settings"
        title="Settings"
      >
        <PixelGearIcon />
      </button>

      {open ? (
        <div className="pixel-panel absolute right-0 mt-3 w-[min(88vw,360px)] bg-[#c79963] p-4 text-white shadow-[8px_8px_0_rgba(0,0,0,0.35)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150">
          <div className="mb-4 border-b-4 border-[color:var(--brown-dark)] pb-3">
            <p className="pixel-title text-xl text-[#ffcf40]">SETTINGS</p>
            <p className="pixel-small mt-2 text-white/80">
              Medieval table controls for smoother play.
            </p>
          </div>

          <div className="space-y-3">
            <SettingToggle
              label="Reduce Effects"
              description="Kurangi glow, blur, pulse, dan animasi non-esensial."
              checked={reduceEffects}
              onChange={setReduceEffects}
            />
            <SettingToggle
              label="Mute SFX"
              description="Matikan efek suara click, victory, defeat, dan emergency."
              checked={muted}
              onChange={setMuted}
            />
            <SettingToggle
              label="Compact UI"
              description="Padatkan panel supaya lebih nyaman di layar kecil."
              checked={compactUi}
              onChange={setCompactUi}
            />

            <div className="rounded-sm border-4 border-[#8a6b45] bg-[#ebdcb8] p-3 text-[#5c4427] shadow-[inset_0_0_0_2px_#fff1c8]">
              <span className="block text-sm leading-tight mb-2">Background Theme</span>
              <div className="grid grid-cols-4 gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { play("click"); setTheme(t.id); }}
                    className={`relative overflow-hidden border-[3px] ${
                      theme === t.id
                        ? "border-[#59a63c] shadow-[0_0_0_2px_#59a63c]"
                        : "border-[#5c4427] opacity-70 hover:opacity-100"
                    }`}
                    title={t.label}
                    aria-label={`Theme: ${t.label}`}
                    aria-pressed={theme === t.id}
                  >
                    <Image
                      src={t.preview}
                      alt={t.label}
                      width={80}
                      height={48}
                      className="h-12 w-full object-cover"
                      loading="lazy"
                    />
                    <span className="pixel-small absolute bottom-0 left-0 right-0 bg-black/50 text-center text-[8px] text-white py-0.5 leading-none">
                      {t.label}
                    </span>
                    {theme === t.id && (
                      <span className="absolute top-0.5 right-0.5 h-2.5 w-2.5 bg-[#59a63c] border border-white" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleOpen}
            className="pixel-button mt-4 w-full text-xs"
          >
            CLOSE
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-sm border-4 border-[#8a6b45] bg-[#ebdcb8] p-3 text-[#5c4427] shadow-[inset_0_0_0_2px_#fff1c8]">
      <span
        className={`mt-1 flex h-6 w-10 shrink-0 items-center border-[3px] border-[#5c4427] p-0.5 ${
          checked ? "justify-end bg-[#59a63c]" : "justify-start bg-[#a8987b]"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="sr-only"
        />
        <span className="block h-3.5 w-3.5 bg-[#fff8ea] shadow-[1px_1px_0_rgba(0,0,0,0.35)]" />
      </span>
      <span>
        <span className="block text-sm leading-tight">{label}</span>
        <span className="pixel-small mt-1 block leading-snug text-[#6a5436]">
          {description}
        </span>
      </span>
    </label>
  );
}
