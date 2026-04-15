import type { Metadata } from "next";
import { LobbyRoomClient } from "@/components/lobby/LobbyRoomClient";

type LobbyPageProps = {
  params: Promise<{ code: string }>;
};

export async function generateMetadata({
  params,
}: LobbyPageProps): Promise<Metadata> {
  const { code } = await params;

  return {
    title: `Lobby ${code.toUpperCase()} | Code Mafia`,
    description: "Retro lobby preview for Code Mafia.",
  };
}

export default async function LobbyRoomPage({ params }: LobbyPageProps) {
  const { code } = await params;

  return <LobbyRoomClient code={code.toUpperCase()} />;
}
