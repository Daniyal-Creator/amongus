import type { Metadata } from "next";
import { GameSessionClient } from "@/components/game/GameSessionClient";

type GamePageProps = {
  params: Promise<{ sessionId: string }>;
};

export async function generateMetadata({
  params,
}: GamePageProps): Promise<Metadata> {
  const { sessionId } = await params;

  return {
    title: `Session ${sessionId} | Code Mole`,
    description: "Retro coding round interface for Code Mole.",
  };
}

export default async function GameSessionPage({ params }: GamePageProps) {
  const { sessionId } = await params;

  return <GameSessionClient sessionId={sessionId} />;
}
