import type { Achievement, GameSnapshot, Player } from "@/types";

const ACHIEVEMENT_COPY: Record<string, Omit<Achievement, "slug">> = {
  "verified-dev": {
    title: "Verified Developer",
    description: "Lulus security scanner atau membantu tim memastikan kode bersih.",
    icon: "🛡️",
    tone: "success",
  },
  "bug-hunter": {
    title: "Bug Hunter",
    description: "Berhasil membantu menemukan imposter atau bug mencurigakan.",
    icon: "🔎",
    tone: "warning",
  },
  "clean-fix": {
    title: "Clean Fix",
    description: "Menang sebagai civilian dengan perbaikan kode yang stabil.",
    icon: "✅",
    tone: "success",
  },
  "silent-saboteur": {
    title: "Silent Saboteur",
    description: "Menang sebagai imposter dengan sabotage yang sulit dibaca.",
    icon: "🗡️",
    tone: "danger",
  },
  "fast-resolver": {
    title: "Fast Resolver",
    description: "Game selesai sebelum semua round habis.",
    icon: "⚡",
    tone: "accent",
  },
};

export function deriveMatchAchievements(snapshot: GameSnapshot): Achievement[] {
  if (snapshot.phase !== "game_over") {
    return [];
  }

  const awards = new Map<string, Achievement>();

  for (const message of snapshot.chatMessages) {
    const match = message.message.match(/^(\p{Emoji}+)\s+(.+?)\s+earned achievement:\s+(.+)$/u);
    if (!match) continue;
    const [, icon, playerName, title] = match;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    awards.set(`${slug}-${playerName}`, {
      slug,
      title,
      description: `${playerName} earned this during the match.`,
      icon,
      tone: "achievement",
    });
  }

  const winnerTeam = snapshot.result.winnerTeam;
  const ejectedImposter = snapshot.players.some(
    (player) => player.role === "imposter" && player.status.includes("ejected"),
  );
  const gameEndedEarly = snapshot.round < snapshot.maxRounds;

  for (const player of snapshot.players) {
    if (winnerTeam === "civilian" && player.role === "civilian") {
      addAward(awards, "clean-fix", player);
    }

    if (winnerTeam === "imposter" && player.role === "imposter") {
      addAward(awards, "silent-saboteur", player);
    }

    if (player.role === "civilian" && ejectedImposter) {
      addAward(awards, "bug-hunter", player);
    }

    if (player.role === "civilian" && snapshot.chatMessages.some((msg) => /security|scanner|verified/i.test(msg.message))) {
      addAward(awards, "verified-dev", player);
    }

    if (gameEndedEarly && winnerTeam === player.role) {
      addAward(awards, "fast-resolver", player);
    }
  }

  return [...awards.values()].slice(0, 8);
}

function addAward(target: Map<string, Achievement>, slug: string, player: Player) {
  const copy = ACHIEVEMENT_COPY[slug];
  if (!copy) return;
  target.set(`${slug}-${player.id}`, {
    slug,
    ...copy,
    description: `${player.name}: ${copy.description}`,
  });
}
