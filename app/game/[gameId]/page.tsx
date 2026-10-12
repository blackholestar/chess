"use client";
import type { Coord, Square, Board, Move, Game, StoredGame } from '@/shared/types';
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { start } from 'repl';
import { getSquare, coordEquals, isEmpty, inBounds, getLegalMoves } from '@/shared/rules';

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

  const [startCoord, setStartCoordInternal] = useState<Coord|null>(null);
  const [legalMoves, setLegalMoves] = useState<Coord[]>([]);
  const [endCoord, setEndCoord] = useState<Coord|null>(null); // should not be used

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

  function setStartCoord(coord: Coord|null) {
    // set startCoord and update legal moves
    if (game != null && coord != null) {
      setLegalMoves(getLegalMoves(game.game, coord));
    } else {
      setLegalMoves([]);
    }
    setStartCoordInternal(coord);
  }

  



  function handleSquareClick(coord: Coord) {
    if (game == null) {
      return;
    }
    if (startCoord != null && legalMoves.some((c) => coordEquals(c, coord))) {
      // start square is already set and this move is legal
      const curSq = getSquare(game.game.board, startCoord);
      if (curSq.color == null || curSq.piece == null) {
        return;
      }
      console.log("ready to move");
      const curMove: Move = {
        color: curSq.color,
        startSq: startCoord,
        endSq: coord,
        piece: curSq.piece
      }
      move(curMove);
      setStartCoord(null);
    } else {
      // start square is not set or this is not a legal move
      // attempt to set this as new start square
      const curSq = getSquare(game.game.board, coord);
      if (curSq.color === game.game.nextTurn) {
        // current square is a piece of the valid color
        setStartCoord(coord);
      } else {
        // current square is not a piece of the valid color
        setStartCoord(null);
      }
    }
  }
  if (game == null) {
    return <p>Loading game...</p>;
  }
  return (
    <div>
      <div className="text-lg">
        Chess
      </div>
      <div>To move: {game.game.nextTurn === "W" ? "White" : "Black"}</div>
      <div>Start: {JSON.stringify(startCoord)}</div>
      <div>Legal moves: {JSON.stringify(legalMoves)}</div>
      
      <table className="h-96 w-96 table-fixed border-collapse bg-slate-800 text-white">
        <tbody>
          {[...game.game.board].reverse().map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((square, colIndex) => (
                <td key={colIndex} className="border border-slate-500 p-0 text-center align-middle">
                  <button className={`h-full w-full ${square.color === 'W' ? "text-red-300" : "text-white"}`} onClick={() => handleSquareClick({x: colIndex, y: 7 - rowIndex})}>
                    {square.piece}.
                    
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
