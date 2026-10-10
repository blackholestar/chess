# Implementation Plan: self-contained chess rules engine (`shared/rules.ts`)

## Findings from exploration (read before coding)

- `shared/types.ts` ALREADY contains what the brief expected to be missing. Do NOT edit it:
  - `State = "NONE" | "CHECK" | "WIN_WHITE" | "WIN_BLACK" | "STALEMATE" | "DRAW" | "END"` (no `"CHECKMATE"`; checkmate is reported as the winner).
  - `Move = { color, startSq, endSq, piece, promotion?: Exclude<Piece, "P" | "K"> }`.
  - Changes needed to types.ts: **none**.
- `shared/rules.ts` currently has only `import { Color, Piece, Coord, State, Square, Move, Board, Game } from "./types";`.
- `server/data.ts` builds `initialGameState.board` with `board[0]` = BLACK back rank, `board[1]` = black pawns, `board[6]` = white pawns, `board[7]` = white back rank. This contradicts the agreed convention (y=0 is white). The user explicitly asked to fix it (item 1).
- `enPassant` is only initialised to `null` in `server/data.ts`; nothing else reads or writes it. No conflicting semantics, so the decided meaning holds: `enPassant` = the skipped square a capturing pawn moves TO.
- `gameManager.move()` is a stub; `app/api/[gameId]/move/route.ts` has a pre-existing type error (`params: Promise<{ move: Move }>`). Both are out of scope; do not touch.
- `app/game/[gameId]/page.tsx` renders `game.board` rows top-to-bottom, so after the data.ts fix white appears at the top of that debug table. Client rendering is out of scope; do not change it (mention it in the final summary).
- Tooling: no test framework, no tsx/ts-node; only `tsc` (TypeScript 5) and `eslint` in `node_modules/.bin`; Node v24.19.0.
- Baseline: `npx tsc --noEmit -p .` already prints a pre-existing error from `.next/dev/types/validator.ts` about `route.ts`. So verify the rules with a standalone tsc invocation on just the relevant files (command below), not the whole project.
- `AGENTS.md` only covers Next.js conventions; not relevant to plain TS in `shared/`.

### Standard verification commands (used throughout)

- Typecheck (must print nothing, exit 0):
  `npx tsc --noEmit --strict --skipLibCheck --target ES2020 --module esnext --moduleResolution bundler shared/types.ts shared/rules.ts server/data.ts`
- Lint (must report 0 errors and no warnings in these files):
  `npx eslint shared/rules.ts server/data.ts`

## Decisions (final; do not re-decide)

1. **Imports**: rules.ts imports ONLY from `./types`, using `import type { ... } from "./types";`, listing only the types actually used (fixes the unused-import lint warnings; the types module has no runtime values).
2. **Purity**: every function is pure; never mutate `game`, `game.board`, squares, coords, or `move`. Boards are copied with `cloneBoard` (new outer array, new row arrays, new square objects). `makeMove` returns a brand-new `Game` with a new `history` array.
3. **Checkmate result**: `getGameState` returns `"WIN_WHITE"` when black (side to move) is mated, `"WIN_BLACK"` when white is mated. `"STALEMATE"` when side to move has no legal moves and is not in check. `"CHECK"` / `"NONE"` otherwise.
4. **Insufficient material**: INCLUDED, returning `"DRAW"` (State has a suitable value). Exactly these cases: K vs K; K + one minor (single N or single B) vs K; any number of bishops only (no other non-king pieces) where all bishops stand on the same square colour (`(x + y) % 2`). Anything with a P, R, Q, or two+ knights, or N+B, is NOT insufficient.
5. **getGameState precedence**: no legal moves → (in check ? WIN_* : STALEMATE); else insufficient material → DRAW; else in check → CHECK; else NONE. It is purely position-derived: it never returns `"END"` and ignores `game.state`.
6. **Terminal states**: `"WIN_WHITE" | "WIN_BLACK" | "STALEMATE" | "DRAW" | "END"` are game-over. `isLegalMove` returns false if `game.state` is any of these. `"END"` is never produced by the rules (left for gameManager, e.g. resignation) but is respected.
7. **getLegalMoves turn behaviour**: returns legal targets for whatever piece sits on `from`, for that piece's own colour, regardless of `game.nextTurn` and regardless of `game.state` (lets the client highlight moves anytime). Returns `[]` for out-of-bounds/non-integer `from` or an empty square. `isLegalMove` enforces turn and game-over.
8. **Castling representation**: the king moves two files (`e1→g1`, `e1→c1`, `e8→g8`, `e8→c8`); `move.piece === "K"`. Castling targets are included in `getLegalMoves` for the king.
9. **Promotion**: when a pawn reaches its promotion rank, `move.promotion` absent → defaults to `"Q"` (legal). `move.promotion` present on any move that is not a pawn reaching the promotion rank → illegal. `move.promotion` not in `{"N","B","R","Q"}` at runtime (untrusted input) → illegal. `makeMove` records the normalized move in history with `promotion` filled in (e.g. `"Q"` when defaulted) and omits `promotion` for non-promotion moves.
10. **Untrusted input**: `isLegalMove` never throws on malformed input; it checks `move` is an object, coords have integer in-bounds `x`/`y`, `move.color` is `"W"|"B"`, etc., and returns false otherwise. History entries are rebuilt from fields (`{ color, startSq: {x,y}, endSq: {x,y}, piece, promotion? }`) so extra client properties are not stored.
11. **enPassant**: `Coord | null`, the skipped square. `nextEnPassant` sets it after every pawn double push (whether or not an enemy pawn can capture), else `null`. `pawnTargets` only accepts it defensively: the ep square must be diagonal-forward of the pawn, lie on rank 5 (y=5) for a white capturer / rank 2 (y=2) for a black capturer, be empty, and the square `{x: ep.x, y: from.y}` must hold an enemy pawn.
12. **Castling rights**: `castlingTargets` requires the right flag AND king on its home square `{x:4, y:homeRank}` AND own rook on the corner (`x=7` kingside, `x=0` queenside). Squares between king and rook empty (kingside f,g; queenside b,c,d). King not currently in check; king's transit and destination squares (kingside f,g; queenside d,c) not attacked. b-file must be empty but may be attacked.
13. **Perft harness**: uses only the public API (`getLegalMoves` + `makeMove`), so it exercises isLegalMove/turn checks too. Promotions expand to 4 moves (Q, R, B, N). Insufficient-material DRAW cannot arise within the tested depths, so terminal-state rejection does not distort counts.

## Exact exports of `shared/rules.ts`

Section header comments per layer (`// ===== Layer 0: primitives =====` etc.) and a concise JSDoc on every function/constant. All of these are `export`ed (lower helpers exported for testability):

```ts
// ---- Layer 0: primitives ----
export const ROOK_DIRS: readonly Coord[];      // (1,0) (-1,0) (0,1) (0,-1)
export const BISHOP_DIRS: readonly Coord[];    // (1,1) (1,-1) (-1,1) (-1,-1)
export const KNIGHT_OFFSETS: readonly Coord[]; // 8 L-shapes
export const KING_OFFSETS: readonly Coord[];   // ROOK_DIRS + BISHOP_DIRS
export function inBounds(c: Coord): boolean;   // integer x,y in 0..7 (Number.isInteger)
export function getSquare(board: Board, c: Coord): Square; // caller guarantees inBounds
export function isEmpty(board: Board, c: Coord): boolean;
export function isEnemy(board: Board, c: Coord, color: Color): boolean;
export function isFriendly(board: Board, c: Coord, color: Color): boolean;
export function opposite(color: Color): Color;
export function coordEquals(a: Coord, b: Coord): boolean;
export function addCoord(c: Coord, dx: number, dy: number): Coord; // new object
export function findKing(board: Board, color: Color): Coord | null;
export function cloneBoard(board: Board): Board;
export function pawnDir(color: Color): 1 | -1;          // W: +1, B: -1
export function pawnStartRank(color: Color): number;    // W: 1, B: 6
export function promotionRank(color: Color): number;    // W: 7, B: 0
export function homeRank(color: Color): number;         // W: 0, B: 7

// ---- Layer 1: pseudo-legal movement (ignores check) ----
export function slide(board: Board, from: Coord, dir: Coord, color: Color): Coord[];
export function slidingTargets(board: Board, from: Coord, dirs: readonly Coord[], color: Color): Coord[];
export function stepTargets(board: Board, from: Coord, offsets: readonly Coord[], color: Color): Coord[];
export function pawnTargets(board: Board, from: Coord, color: Color, enPassant: Coord | null): Coord[];
export function pseudoLegalTargets(game: Game, from: Coord): Coord[]; // excludes castling

// ---- Layer 1b: attacks ----
export function isSquareAttacked(board: Board, sq: Coord, byColor: Color): boolean;
export function isInCheck(board: Board, color: Color): boolean; // false if no king found

// ---- Layer 2: game-aware rules ----
export function castlingTargets(game: Game, from: Coord): Coord[];
export function applyMoveToBoard(board: Board, move: Move, enPassant: Coord | null): Board;
export function leavesKingSafe(game: Game, move: Move): boolean;
export function nextCastlingRights(game: Game, move: Move): {
  whiteCastlingKingside: boolean; whiteCastlingQueenside: boolean;
  blackCastlingKingside: boolean; blackCastlingQueenside: boolean;
};
export function nextEnPassant(move: Move): Coord | null;
export function hasInsufficientMaterial(board: Board): boolean;
export function hasAnyLegalMove(game: Game, color: Color): boolean;

// ---- Layer 3: public API ----
export function getLegalMoves(game: Game, from: Coord): Coord[];
export function isLegalMove(game: Game, move: Move): boolean;
export function makeMove(game: Game, move: Move): Game;
export function getGameState(game: Game): State;
```

Do not export anything else. Private (non-exported) helpers are allowed only if trivial (e.g. `isPromotionPiece` type guard, `isValidCoordInput`).

### Behaviour details per function

- `slide`: walk `from + k*dir`, k=1..; push empties; push first enemy square then stop; stop before a friendly piece or off-board.
- `stepTargets`: each `from + offset` that is in bounds and not friendly.
- `pawnTargets`: single push if empty; double push only if `from.y === pawnStartRank(color)` and both squares empty; diagonal captures onto enemies; en passant per Decision 11. Promotion-rank targets are returned as plain coords (promotion piece chosen in the Move).
- `pseudoLegalTargets`: reads `getSquare(game.board, from)`; dispatch N→KNIGHT_OFFSETS, B→BISHOP_DIRS, R→ROOK_DIRS, Q→both, K→KING_OFFSETS step, P→pawnTargets with `game.enPassant`. `[]` if empty/out of bounds.
- `isSquareAttacked`: scan outward from `sq`: knight offsets hitting a `byColor` N; for each ROOK_DIR the first non-empty square is `byColor` R or Q; for each BISHOP_DIR first non-empty square is `byColor` B or Q; pawns: `byColor` P on `{sq.x±1, sq.y - pawnDir(byColor)}`; king: `byColor` K on any KING_OFFSET square. Works whether `sq` is empty or occupied.
- `applyMoveToBoard`: clone; read moving square from `move.startSq`; if pawn moves diagonally onto an empty square equal to `enPassant`, clear `{x: endSq.x, y: startSq.y}`; if king moves |dx| === 2, move rook from x=7→x=5 (kingside, dx>0) or x=0→x=3 (queenside) on that rank; place piece on `endSq` (pawn on `promotionRank` becomes `move.promotion ?? "Q"`); clear `startSq`. Does not validate.
- `leavesKingSafe`: `!isInCheck(applyMoveToBoard(game.board, move, game.enPassant), move.color)` (covers pins and the en-passant horizontal discovered check).
- `nextCastlingRights`: start from game flags; king move of colour C clears both C rights; any move from or to a corner square clears the corresponding right (a1→WQ, h1→WK, a8→BQ, h8→BK) — covers rook moving off home and rook being captured on home.
- `nextEnPassant`: pawn with |dy| === 2 → `{x: startSq.x, y: (startSq.y + endSq.y) / 2}`; else `null`.
- `hasAnyLegalMove`: loop all squares with `color`; for each, `getLegalMoves(game, sq).length > 0` → return true (early exit).
- `getLegalMoves`: validate `from`; `[...pseudoLegalTargets, ...castlingTargets]` filtered by `leavesKingSafe` with a synthesized move `{color, startSq: from, endSq: t, piece}` (promotion irrelevant for safety).
- `isLegalMove`: per Decisions 6, 9, 10: game not terminal; well-formed move; `move.color === game.nextTurn`; board square at startSq has `color === move.color` and `piece === move.piece`; endSq ∈ `getLegalMoves(game, startSq)`; promotion rules. Returns boolean, never throws.
- `makeMove`: `if (!isLegalMove(game, move)) throw new Error("Illegal move")`; build normalized move; new board via `applyMoveToBoard`; `nextTurn = opposite`; `history = [...game.history, normalized]`; castling rights via `nextCastlingRights`; `enPassant = nextEnPassant`; `state = getGameState(newGameWithoutState)`. Returns new Game; input untouched.
- `getGameState`: per Decision 5, side to move = `game.nextTurn`.

---

# Implementation Plan

- [ ] 1. Fix the initial board orientation in `server/data.ts` so `board[0]` is white's back rank (user request). Reorder the `board` array to: `createPieceRank("W", backRank)`, `createPieceRank("W", Array(8).fill("P"))`, four `createEmptyRank()`, `createPieceRank("B", Array(8).fill("P"))`, `createPieceRank("B", backRank)`. Keep `backRank` as is (R N B Q K B N R → queen x=3, king x=4 for both colours). Change nothing else in the file and do not touch the client.
      Files: server/data.ts
      Verify: standard typecheck command prints nothing; `npx eslint server/data.ts` reports no problems. (Board contents are re-verified by the perft start position in item 6, which builds its start game from `initialGameState`.)

- [ ] 2. Write Layer 0 in `shared/rules.ts`: replace the import with `import type { ... } from "./types"` (only used types), add the section header, the four direction/offset constants, and all Layer 0 functions with JSDoc exactly as in the export list above. `inBounds` must use `Number.isInteger` on both fields.
      Files: shared/rules.ts
      Verify: standard typecheck command prints nothing.

- [ ] 3. Add Layer 1 (`slide`, `slidingTargets`, `stepTargets`, `pawnTargets`, `pseudoLegalTargets`) and Layer 1b (`isSquareAttacked`, `isInCheck`) per the behaviour details. Depends on item 2.
      Files: shared/rules.ts
      Verify: standard typecheck command prints nothing.

- [ ] 4. Add Layer 2 (`castlingTargets`, `applyMoveToBoard`, `leavesKingSafe`, `nextCastlingRights`, `nextEnPassant`, `hasInsufficientMaterial`, `hasAnyLegalMove`) per Decisions 4, 11, 12 and behaviour details. `hasAnyLegalMove` calls `getLegalMoves` (Layer 3, function declarations hoist, so ordering in the file is fine). Depends on item 3.
      Files: shared/rules.ts
      Verify: standard typecheck command prints nothing.

- [ ] 5. Add Layer 3 (`getLegalMoves`, `isLegalMove`, `makeMove`, `getGameState`) per Decisions 3, 5–10, each with JSDoc that documents the decisions (turn-agnostic getLegalMoves, promotion default to queen, throws on illegal move, checkmate reported as WIN_*). Depends on item 4.
      Files: shared/rules.ts
      Verify: standard typecheck command prints nothing; `npx eslint shared/rules.ts server/data.ts` reports 0 problems.

- [ ] 6. Build and run a TEMPORARY perft harness, fix any mismatches in rules.ts, then delete the harness. Depends on items 1 and 5.
      Harness file: `shared/__perft.ts` (temporary). It imports `{ getLegalMoves, makeMove, isLegalMove, getGameState, inBounds }` from `./rules`, `initialGameState` from `../server/data`, and types from `./types`. Contents:
      - `fromFen(fen): Game` — FEN rank 8 → `y=7`, rank 1 → `y=0`, file a → `x=0`; uppercase = `"W"`, lowercase = `"B"`; side to move → `nextTurn`; castling field → four flags; ep field `e3` → `{x:4, y:2}` or `null`; `history: []`; `state` = `getGameState` of the built game.
      - `perft(game, depth): number` — depth 0 → 1. Otherwise for every square with `color === game.nextTurn`, for each target from `getLegalMoves`: if piece is `"P"` and target y is the mover's promotion rank, recurse for each of `"Q","R","B","N"` with `makeMove(game, {...move, promotion})`; else recurse with `makeMove(game, move)`. Sum leaf counts.
      - Extra checks (assert, exit non-zero on failure): (a) `JSON.stringify` of the input game is unchanged after `makeMove` (purity) for the start position; (b) start position via `initialGameState` equals perft of `fromFen(startFen)` at depth 3; (c) `isLegalMove` is false for a black move when `nextTurn` is `"W"`, for a move whose `piece` mismatches the board, and for `promotion: "K"` on a promoting pawn; (d) `getGameState(fromFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"))` (black stalemated) is `"STALEMATE"`, `getGameState(fromFen("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"))` (fool's mate) is `"WIN_BLACK"`, `getGameState(fromFen("8/8/4k3/8/8/3NK3/8/8 w - - 0 1"))` is `"DRAW"`; (e) `makeMove` throws on an illegal move.
      - Print each position/depth with actual vs expected and a final PASS/FAIL; `process.exit(1)` on any mismatch.
      Expected perft numbers (must all match exactly):
      | Position | FEN | d1 | d2 | d3 | d4 |
      |---|---|---|---|---|---|
      | Start | `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1` (also via `initialGameState`) | 20 | 400 | 8902 | 197281 |
      | Kiwipete | `r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1` | 48 | 2039 | 97862 | — |
      | Position 3 | `8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1` | 14 | 191 | 2812 | 43238 |
      | Position 4 | `r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1` | 6 | 264 | 9467 | — |
      | Position 5 | `rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPPPNnPP/RNBQK2R w KQ - 1 8` | 44 | 1486 | 62379 | — |
      | Position 6 | `r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P3/2NP1N2/PPP1QPPP/R4RK1 w - - 0 10` | 46 | 2079 | 89890 | — |
      Run:
      `npx tsc --strict --skipLibCheck --target ES2020 --module commonjs --moduleResolution node --outDir /tmp/chess-perft shared/__perft.ts && node /tmp/chess-perft/shared/__perft.js`
      (tsc will place output under `/tmp/chess-perft/shared/` and `/tmp/chess-perft/server/` because the harness imports `../server/data`; if the layout differs, run the emitted `__perft.js`.) If a count mismatches, debug with a per-move divide (perft d-1 per root move) against known divide output, fix `shared/rules.ts` (never the expected numbers), and rerun until all PASS.
      Cleanup (mandatory): `rm shared/__perft.ts && rm -rf /tmp/chess-perft`.
      Files: shared/__perft.ts (temporary, deleted), shared/rules.ts (fixes only)
      Verify: harness prints PASS for every row and every extra check, exits 0; after cleanup `git status --porcelain shared` shows no `__perft` file; standard typecheck and lint commands are still clean.

- [ ] 7. Final review pass. Confirm rules.ts imports only from `./types` (type-only), has no mutation of inputs (no assignment into `game.*`, `board[y][x] =` only on cloned boards), every exported function has JSDoc, and each layer has a section header. Confirm `git diff --stat` touches only `shared/rules.ts` and `server/data.ts` (types.ts unchanged; gameManager, API routes, client untouched). Do not commit `.agents/`.
      Files: none new
      Verify: standard typecheck command prints nothing; `npx eslint shared/rules.ts server/data.ts` reports 0 problems; `git diff --stat` / `git status` show only the two intended files changed (shared/ and server/ are untracked in git, so check `git status --porcelain` lists no new unexpected files).

## Changes outside rules.ts

- `server/data.ts`: initial board rows reordered so `board[0]` is white's back rank (user request, required for the rules' y=0-is-white convention).
- `shared/types.ts`: no change needed (STALEMATE, DRAW, WIN_* states and `Move.promotion` already exist).
- Known side effect to report to the user: the debug table in `app/game/[gameId]/page.tsx` renders row 0 first, so white now appears at the top. Not changed (client out of scope).
