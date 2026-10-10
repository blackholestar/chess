"use client";
import type { Game } from '@/shared/types';
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function Page() {
  return (
    <Suspense fallback={<p>Waiting for game URL...</p>}>
      <GameContent />
    </Suspense>
  );
}

function GameContent() {
  const params = useParams();
  const gameId = params.gameId as string;
  const [game, setGame] = useState<Game|null>(null);
  const refreshRate = 2000;

  // get game
  const getGame = useCallback(async () => {
    const response = await fetch(`/api/${gameId}/load-game`);
    const data = await response.json();
    
    if (!response.ok || data.error != null) {
      console.error(data.error ?? "Failed to fetch game");
      return data.error ?? "Failed to fetch game";
    }
    console.log(data);
    setGame(data.game);
  }, [gameId]);

  // get gamestate at start
  useEffect(() => {
    const timeout = setTimeout(() => {
      void getGame();
    }, 0);

    return () => clearTimeout(timeout);
  }, [getGame]);
  
  // get gamestate every x seconds
  useEffect(() => {
  const interval = setInterval(() => {
    void getGame();
  }, refreshRate);

  return () => clearInterval(interval);
}, [getGame]);
  
  

  if (game == null) {
    return <p>Loading game...</p>;
  }

  return (
    <div>
      <div className="text-lg">
        Chess
      </div>
        
      <table className="h-96 w-96 table-fixed border-collapse bg-slate-800 text-white">
        <tbody>
          {game.board.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((square, colIndex) => (
                <td key={colIndex} className="border border-slate-500 text-center align-middle">
                  {square.piece}.
                  {square.color}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
