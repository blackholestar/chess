"use client";
import type { Color, Coord, Square, Board, Move, Game, StoredGame, ApiResult } from '@/shared/types';
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
  const [game, setGame] = useState<Game|null>(null);
  const refreshRate = 2000;

  const [startCoord, setStartCoordInternal] = useState<Coord|null>(null);
  const [legalMoves, setLegalMoves] = useState<Coord[]>([]);

  // general function for requests
  async function fetchJson<T>(url: string, options?: any): Promise<T> {
    const response = await fetch(url, options);
    const data = await response.json() as ApiResult<T>;
    if (!data.success) {
      alert(data.error ?? `unknown error at ${url}`);
      throw new Error(data.error ?? `unknown error at ${url}`);
    }
    return data.data;
  }

  // get game
  const getGame = useCallback(async () => {
    const newGame = await fetchJson<Game>(`/api/${gameId}/load-game`);
    setGame(newGame);
    /*const response = await fetch(`/api/${gameId}/load-game`);
    const data = await response.json();
    
    if (!response.ok || data.error != null) {
      console.error(data.error ?? "Failed to fetch game");
      return data.error ?? "Failed to fetch game";
    }
    console.log(data);
    setGame(data.game);*/
  }, [gameId]);
  
  // get gamestate at start
  useEffect(() => {void getGame()}, []);
  // get gamestate every x seconds
  useEffect(() => {
  const interval = setInterval(() => {
    void getGame();
  }, refreshRate);

  return () => clearInterval(interval);
}, [getGame]);
  
  async function move(move: Move) {
    const newGame = await fetchJson<Game>(`/api/${gameId}/move`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        move
      })
    });
    setGame(newGame);
    /*
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
    */
  }

  async function resetGame() {
    const newGame = await fetchJson<Game>(`/api/${gameId}/reset-game`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }});
    setGame(newGame);
  }
  function setStartCoord(coord: Coord|null) {
    // set startCoord and update legal moves
    if (game != null && coord != null) {
      setLegalMoves(getLegalMoves(game, coord));
    } else {
      setLegalMoves([]);
    }
    setStartCoordInternal(coord);
  }


  function handleSquareClick(coord: Coord) {
    if (game == null) {
      return;
    }

    // With a piece selected, a click on one of its legal destinations plays the move.
    // Derive legality from the current game/selection rather than trusting `legalMoves`
    // state, so correctness doesn't depend on the two staying in sync.
    if (startCoord != null) {
      const selected = getSquare(game.board, startCoord);
      const isLegalDestination = getLegalMoves(game, startCoord).some((c) =>
        coordEquals(c, coord),
      );
      if (selected.color != null && selected.piece != null && isLegalDestination) {
        void move({
          color: selected.color,
          startSq: startCoord,
          endSq: coord,
          piece: selected.piece,
          // Pawns reaching the last rank auto-promote to a queen for now
          // (makeMove defaults an omitted promotion to "Q"); a promotion
          // picker would set `promotion` here.
        });
        setStartCoord(null);
        return;
      }
    }

    // Otherwise this click selects a new piece or clears the selection.
    // Select only an own-colour piece that isn't already selected; any other
    // click (empty square, enemy piece, or the already-selected square) clears.
    const clicked = getSquare(game.board, coord);
    const canSelect =
      clicked.color === game.nextTurn &&
      (startCoord == null || !coordEquals(startCoord, coord));
    setStartCoord(canSelect ? coord : null);
  }

  function displayCoords(view: Color): Coord[][] {
    const ys = [0,1,2,3,4,5,6,7];
    const xs = [0,1,2,3,4,5,6,7];
    const rows = view === "W" ? [...ys].reverse() : ys;   // white: rank 8 on top
    const cols = view === "W" ? xs : [...xs].reverse();   // black: h-file on left
    return rows.map((y) => cols.map((x) => ({x: x, y: y})));
  }


  if (game == null) {
    return <p>Loading game...</p>;
  }
  return (
    <div>
      <div className="text-lg">
        Chess
      </div>
      <div>To move: {game.nextTurn === "W" ? "White" : "Black"}</div>
      <div>Start: {JSON.stringify(startCoord)}</div>
      <div>Legal moves: {JSON.stringify(legalMoves)}</div>
      <div>State: {game.state}</div>
      <table className="table-fixed border-collapse text-white">
        <tbody>
        {displayCoords("W").map((row) =>
        <tr key={row[0].y}>
          {row.map((coord) => {
            const {piece, color} = getSquare(game.board, coord);
            const isLegal = legalMoves.some((c) => coordEquals(c, coord))
            const pieceName = piece && `${piece}${color}`
            return (
              <td key={coord.x} className={`h-16 w-16 border border-slate-500 p-0 ${((coord.x+coord.y) % 2) ? `bg-orange-200` : `bg-orange-400`} text-center align-middle`}>
                <button 
                  className={`relative flex h-16 w-16 items-center justify-center`}
                  onClick={() => handleSquareClick(coord)}
                >
                  {(piece != null) && <img src={`/${pieceName}.svg`} className="h-12 w-12" alt={`${pieceName}`} />}
                  {isLegal && (
                    <span className="pointer-events-none absolute h-5 w-5 rounded-full bg-gray-500/80" />
                  )}
                </button>
              </td>
            );
          })}
        </tr>
      )}
        </tbody>
      </table>
      

      <div><button onClick={resetGame}>Reset</button> </div>
    </div>
  );
}

type SquareProps = {
  handleSquareClick: (coord: Coord) => void,
}
function Square() {

}