"use client";
import type { Coord, Square, Board, Move, Game, StoredGame } from '@/shared/types';
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { start } from 'repl';
import { inBounds } from '@/shared/rules';

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
  const [game, setGame] = useState<StoredGame|null>(null);
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
  
  async function move(move: Move) {
    const response = await fetch(`/api/${gameId}/move`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        move
      })
    });
    const data = await response.json();
    if (!response.ok || data.error != null) {
      alert(JSON.stringify(data.error));
      return;
    }
    setGame(data.game);
  }
  




  // debug move
  const [startSquareX, setStartSquareX] = useState(0);
  const [startSquareY, setStartSquareY] = useState(0);
  const [endSquareX, setEndSquareX] = useState(0);
  const [endSquareY, setEndSquareY] = useState(0);

  async function debugMove() {
    if (game == null) {
      alert("Not loaded");
      return;
    }
    if (!inBounds({x: startSquareX, y: startSquareY}) || !inBounds({x: endSquareX, y: endSquareY})) {
      alert("Invalid coordinate");
      return;
    }
    const color = game.game.board[startSquareY][startSquareX].color;
    const piece = game.game.board[startSquareY][startSquareX].piece;
    if (color == null || piece == null) {
      alert("Empty starting square");
      return;
    }
    const nextMove: Move = {
      color: color,
      piece: piece,
      startSq: {x: startSquareX, y: startSquareY},
      endSq: {x: endSquareX, y: endSquareY}
    }
    move(nextMove);
  }


  if (game == null) {
    return <p>Loading game...</p>;
  }
  return (
    <div>
      <div className="text-lg">
        Chess
      </div>
        
      <div key="debug input move">
        Debug move
        <input type="text" value={startSquareX} onChange={(e) => setStartSquareX(+e.target.value)} placeholder="start x"/>
        <input type="text" value={startSquareY} onChange={(e) => setStartSquareY(+e.target.value)} placeholder="start y"/>
        <input type="text" value={endSquareX} onChange={(e) => setEndSquareX(+e.target.value)} placeholder="end x"/>
        <input type="text" value={endSquareY} onChange={(e) => setEndSquareY(+e.target.value)} placeholder="end y"/>
        <button onClick={() => debugMove()}>Move</button>
      </div>
      <table className="h-96 w-96 table-fixed border-collapse bg-slate-800 text-white">
        <tbody>
          {[...game.game.board].reverse().map((row, rowIndex) => (
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
