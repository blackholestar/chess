import type { Board, Color, Coord, Game, Move, Piece, Square, State } from "./types";

/*
 * Self-contained chess rules engine.
 *
 * Conventions:
 * - board[y][x], x = file (0 = a .. 7 = h), y = rank (0 = rank 1 .. 7 = rank 8).
 * - y = 0 is White's back rank. White pawns move +y (start y=1, promote y=7),
 *   black pawns move -y (start y=6, promote y=0). Kings start on x=4.
 * - game.enPassant is the square a capturing pawn moves TO (the skipped square),
 *   or null.
 * - Castling is a king move of two files (e1->g1, e1->c1, e8->g8, e8->c8).
 *
 * Every function is pure: inputs are never mutated, boards are cloned first.
 * Only depends on ./types.
 */

type PromotionPiece = Exclude<Piece, "P" | "K">;

// ===== Layer 0: primitives =====

/** Orthogonal directions (rook movement). */
export const ROOK_DIRS: readonly Coord[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
];

/** Diagonal directions (bishop movement). */
export const BISHOP_DIRS: readonly Coord[] = [
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
];

/** The 8 L-shaped knight jumps. */
export const KNIGHT_OFFSETS: readonly Coord[] = [
    { x: 1, y: 2 },
    { x: 2, y: 1 },
    { x: 2, y: -1 },
    { x: 1, y: -2 },
    { x: -1, y: -2 },
    { x: -2, y: -1 },
    { x: -2, y: 1 },
    { x: -1, y: 2 },
];

/** The 8 one-square king steps. */
export const KING_OFFSETS: readonly Coord[] = [...ROOK_DIRS, ...BISHOP_DIRS];

/** True if both coordinates are integers in 0..7. */
export function inBounds(c: Coord): boolean {
    return (
        Number.isInteger(c.x) &&
        Number.isInteger(c.y) &&
        c.x >= 0 &&
        c.x < 8 &&
        c.y >= 0 &&
        c.y < 8
    );
}

/** Square at `c`. Caller guarantees `inBounds(c)`. */
export function getSquare(board: Board, c: Coord): Square {
    return board[c.y][c.x];
}

/** True if the square at `c` holds no piece. */
export function isEmpty(board: Board, c: Coord): boolean {
    return getSquare(board, c).piece === null;
}

/** True if the square at `c` holds a piece of the opposite colour to `color`. */
export function isEnemy(board: Board, c: Coord, color: Color): boolean {
    const sq = getSquare(board, c);
    return sq.color !== null && sq.color !== color;
}

/** True if the square at `c` holds a piece of `color`. */
export function isFriendly(board: Board, c: Coord, color: Color): boolean {
    return getSquare(board, c).color === color;
}

/** The other colour. */
export function opposite(color: Color): Color {
    return color === "W" ? "B" : "W";
}

/** True if both coords point to the same square. */
export function coordEquals(a: Coord, b: Coord): boolean {
    return a.x === b.x && a.y === b.y;
}

/** New coord offset from `c` by (dx, dy). */
export function addCoord(c: Coord, dx: number, dy: number): Coord {
    return { x: c.x + dx, y: c.y + dy };
}

/** Location of `color`'s king, or null if there is none on the board. */
export function findKing(board: Board, color: Color): Coord | null {
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const sq = board[y][x];
            if (sq.piece === "K" && sq.color === color) {
                return { x, y };
            }
        }
    }
    return null;
}

/** Deep copy of the board (new rows and new square objects). */
export function cloneBoard(board: Board): Board {
    return board.map((row) => row.map((sq) => ({ ...sq })));
}

/** Direction pawns of `color` move along y: White +1, Black -1. */
export function pawnDir(color: Color): 1 | -1 {
    return color === "W" ? 1 : -1;
}

/** Rank pawns of `color` start on (double push allowed from here). */
export function pawnStartRank(color: Color): number {
    return color === "W" ? 1 : 6;
}

/** Rank on which pawns of `color` promote. */
export function promotionRank(color: Color): number {
    return color === "W" ? 7 : 0;
}

/** Back rank of `color` (king and rooks start here). */
export function homeRank(color: Color): number {
    return color === "W" ? 0 : 7;
}

/** True if `p` is a piece a pawn may promote to. */
function isPromotionPiece(p: unknown): p is PromotionPiece {
    return p === "N" || p === "B" || p === "R" || p === "Q";
}

/** True if untrusted `c` is an object with integer in-bounds x and y. */
function isValidCoordInput(c: unknown): c is Coord {
    return typeof c === "object" && c !== null && inBounds(c as Coord);
}

// ===== Layer 1: pseudo-legal movement (ignores check) =====

/**
 * Squares reachable by sliding from `from` along `dir`: every empty square,
 * plus the first enemy-occupied square. Stops before a friendly piece or the edge.
 */
export function slide(board: Board, from: Coord, dir: Coord, color: Color): Coord[] {
    const targets: Coord[] = [];
    let cur = addCoord(from, dir.x, dir.y);
    while (inBounds(cur)) {
        if (isEmpty(board, cur)) {
            targets.push(cur);
        } else {
            if (isEnemy(board, cur, color)) {
                targets.push(cur);
            }
            break;
        }
        cur = addCoord(cur, dir.x, dir.y);
    }
    return targets;
}

/** Union of `slide` over every direction in `dirs` (bishop, rook, queen). */
export function slidingTargets(
    board: Board,
    from: Coord,
    dirs: readonly Coord[],
    color: Color,
): Coord[] {
    return dirs.flatMap((dir) => slide(board, from, dir, color));
}

/** Single-step targets (knight, king): each in-bounds offset not holding a friendly piece. */
export function stepTargets(
    board: Board,
    from: Coord,
    offsets: readonly Coord[],
    color: Color,
): Coord[] {
    return offsets
        .map((o) => addCoord(from, o.x, o.y))
        .filter((c) => inBounds(c) && !isFriendly(board, c, color));
}

/**
 * Pawn targets: single push, double push from the start rank, diagonal captures,
 * and en passant. `enPassant` is only honoured if it is diagonal-forward of the
 * pawn, on the correct rank (y=5 for White, y=2 for Black), empty, and an enemy
 * pawn sits beside the capturer on that file. Promotion squares are plain coords.
 */
export function pawnTargets(
    board: Board,
    from: Coord,
    color: Color,
    enPassant: Coord | null,
): Coord[] {
    const targets: Coord[] = [];
    const dir = pawnDir(color);

    const one = addCoord(from, 0, dir);
    if (inBounds(one) && isEmpty(board, one)) {
        targets.push(one);
        const two = addCoord(from, 0, 2 * dir);
        if (from.y === pawnStartRank(color) && inBounds(two) && isEmpty(board, two)) {
            targets.push(two);
        }
    }

    const epRank = color === "W" ? 5 : 2;
    for (const dx of [-1, 1]) {
        const t = addCoord(from, dx, dir);
        if (!inBounds(t)) continue;
        if (isEnemy(board, t, color)) {
            targets.push(t);
        } else if (
            enPassant &&
            coordEquals(t, enPassant) &&
            t.y === epRank &&
            isEmpty(board, t)
        ) {
            const victim = getSquare(board, { x: t.x, y: from.y });
            if (victim.piece === "P" && victim.color === opposite(color)) {
                targets.push(t);
            }
        }
    }
    return targets;
}

/**
 * Pseudo-legal targets for the piece on `from` (ignores check, excludes castling).
 * Returns [] if `from` is out of bounds or empty.
 */
export function pseudoLegalTargets(game: Game, from: Coord): Coord[] {
    if (!inBounds(from)) return [];
    const sq = getSquare(game.board, from);
    if (sq.color === null) return [];
    const { board } = game;
    switch (sq.piece) {
        case "N":
            return stepTargets(board, from, KNIGHT_OFFSETS, sq.color);
        case "B":
            return slidingTargets(board, from, BISHOP_DIRS, sq.color);
        case "R":
            return slidingTargets(board, from, ROOK_DIRS, sq.color);
        case "Q":
            return slidingTargets(board, from, KING_OFFSETS, sq.color);
        case "K":
            return stepTargets(board, from, KING_OFFSETS, sq.color);
        case "P":
            return pawnTargets(board, from, sq.color, game.enPassant);
        default:
            return [];
    }
}

// ===== Layer 1b: attacks =====

/**
 * True if any piece of `byColor` attacks `sq` (whether `sq` is empty or occupied).
 * Scans outward from `sq` for knights, sliders, pawns and the king.
 */
export function isSquareAttacked(board: Board, sq: Coord, byColor: Color): boolean {
    const holds = (c: Coord, pieces: readonly Piece[]): boolean => {
        if (!inBounds(c)) return false;
        const s = getSquare(board, c);
        return s.color === byColor && pieces.includes(s.piece);
    };

    for (const o of KNIGHT_OFFSETS) {
        if (holds(addCoord(sq, o.x, o.y), ["N"])) return true;
    }

    const firstPiece = (dir: Coord): Coord | null => {
        let cur = addCoord(sq, dir.x, dir.y);
        while (inBounds(cur)) {
            if (!isEmpty(board, cur)) return cur;
            cur = addCoord(cur, dir.x, dir.y);
        }
        return null;
    };
    for (const dir of ROOK_DIRS) {
        const hit = firstPiece(dir);
        if (hit && holds(hit, ["R", "Q"])) return true;
    }
    for (const dir of BISHOP_DIRS) {
        const hit = firstPiece(dir);
        if (hit && holds(hit, ["B", "Q"])) return true;
    }

    // A pawn of byColor attacks one rank ahead of itself, so look one rank "behind" sq.
    const back = -pawnDir(byColor);
    if (holds(addCoord(sq, -1, back), ["P"]) || holds(addCoord(sq, 1, back), ["P"])) {
        return true;
    }

    for (const o of KING_OFFSETS) {
        if (holds(addCoord(sq, o.x, o.y), ["K"])) return true;
    }
    return false;
}

/** True if `color`'s king is attacked. False if `color` has no king on the board. */
export function isInCheck(board: Board, color: Color): boolean {
    const king = findKing(board, color);
    if (!king) return false;
    return isSquareAttacked(board, king, opposite(color));
}

// ===== Layer 2: game-aware rules =====

/**
 * Castling destinations for the king on `from`. Requires the castling right,
 * king on its home square, own rook in the corner, empty squares between them,
 * king not in check, and the transit/destination squares not attacked.
 * (The b-file square must be empty for queenside but may be attacked.)
 */
export function castlingTargets(game: Game, from: Coord): Coord[] {
    if (!inBounds(from)) return [];
    const { board } = game;
    const sq = getSquare(board, from);
    if (sq.color === null || sq.piece !== "K") return [];
    const color = sq.color;
    const rank = homeRank(color);
    if (!coordEquals(from, { x: 4, y: rank })) return [];

    const enemy = opposite(color);
    if (isSquareAttacked(board, from, enemy)) return [];

    const ownRookAt = (x: number): boolean => {
        const s = board[rank][x];
        return s.color === color && s.piece === "R";
    };
    const empty = (x: number): boolean => isEmpty(board, { x, y: rank });
    const safe = (x: number): boolean => !isSquareAttacked(board, { x, y: rank }, enemy);

    const kingside = color === "W" ? game.whiteCastlingKingside : game.blackCastlingKingside;
    const queenside = color === "W" ? game.whiteCastlingQueenside : game.blackCastlingQueenside;

    const targets: Coord[] = [];
    if (kingside && ownRookAt(7) && empty(5) && empty(6) && safe(5) && safe(6)) {
        targets.push({ x: 6, y: rank });
    }
    if (
        queenside &&
        ownRookAt(0) &&
        empty(1) &&
        empty(2) &&
        empty(3) &&
        safe(3) &&
        safe(2)
    ) {
        targets.push({ x: 2, y: rank });
    }
    return targets;
}

/**
 * New board with `move` applied (does not validate). Handles en passant removal
 * (pawn moving diagonally onto the empty `enPassant` square), castling rook
 * relocation (king moving two files), and promotion (`move.promotion`, default "Q").
 */
export function applyMoveToBoard(board: Board, move: Move, enPassant: Coord | null): Board {
    const b = cloneBoard(board);
    const { startSq: start, endSq: end } = move;
    const moving = getSquare(b, start);
    if (moving.color === null) return b;

    const dx = end.x - start.x;

    if (
        moving.piece === "P" &&
        dx !== 0 &&
        isEmpty(b, end) &&
        enPassant &&
        coordEquals(end, enPassant)
    ) {
        b[start.y][end.x] = { color: null, piece: null };
    }

    if (moving.piece === "K" && Math.abs(dx) === 2) {
        const rank = start.y;
        const [rookFrom, rookTo] = dx > 0 ? [7, 5] : [0, 3];
        b[rank][rookTo] = b[rank][rookFrom];
        b[rank][rookFrom] = { color: null, piece: null };
    }

    let piece: Piece = moving.piece;
    if (piece === "P" && end.y === promotionRank(moving.color)) {
        piece = move.promotion ?? "Q";
    }
    b[end.y][end.x] = { color: moving.color, piece };
    b[start.y][start.x] = { color: null, piece: null };
    return b;
}

/** True if, after `move`, the mover's king is not attacked (covers pins and en passant discovery). */
export function leavesKingSafe(game: Game, move: Move): boolean {
    return !isInCheck(applyMoveToBoard(game.board, move, game.enPassant), move.color);
}

/**
 * Castling rights after `move`: a king move clears both of its side's rights;
 * any move from or to a corner (a1, h1, a8, h8) clears that corner's right
 * (covers rooks moving away and rooks being captured).
 */
export function nextCastlingRights(
    game: Game,
    move: Move,
): {
    whiteCastlingKingside: boolean;
    whiteCastlingQueenside: boolean;
    blackCastlingKingside: boolean;
    blackCastlingQueenside: boolean;
} {
    const rights = {
        whiteCastlingKingside: game.whiteCastlingKingside,
        whiteCastlingQueenside: game.whiteCastlingQueenside,
        blackCastlingKingside: game.blackCastlingKingside,
        blackCastlingQueenside: game.blackCastlingQueenside,
    };
    if (move.piece === "K") {
        if (move.color === "W") {
            rights.whiteCastlingKingside = false;
            rights.whiteCastlingQueenside = false;
        } else {
            rights.blackCastlingKingside = false;
            rights.blackCastlingQueenside = false;
        }
    }
    for (const c of [move.startSq, move.endSq]) {
        if (coordEquals(c, { x: 0, y: 0 })) rights.whiteCastlingQueenside = false;
        if (coordEquals(c, { x: 7, y: 0 })) rights.whiteCastlingKingside = false;
        if (coordEquals(c, { x: 0, y: 7 })) rights.blackCastlingQueenside = false;
        if (coordEquals(c, { x: 7, y: 7 })) rights.blackCastlingKingside = false;
    }
    return rights;
}

/** En passant square after `move`: the skipped square for a pawn double push, else null. */
export function nextEnPassant(move: Move): Coord | null {
    if (move.piece === "P" && Math.abs(move.endSq.y - move.startSq.y) === 2) {
        return { x: move.startSq.x, y: (move.startSq.y + move.endSq.y) / 2 };
    }
    return null;
}

/**
 * True if neither side can ever mate: K vs K, K + single minor vs K, or only
 * bishops besides kings with every bishop on the same square colour.
 */
export function hasInsufficientMaterial(board: Board): boolean {
    let knights = 0;
    const bishopShades = new Set<number>();
    let bishops = 0;
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const p = board[y][x].piece;
            if (p === "P" || p === "R" || p === "Q") return false;
            if (p === "N") knights++;
            if (p === "B") {
                bishops++;
                bishopShades.add((x + y) % 2);
            }
        }
    }
    if (knights === 0 && bishops === 0) return true;
    if (knights === 1 && bishops === 0) return true;
    if (knights === 0 && bishopShades.size === 1) return true;
    return false;
}

/** True if `color` has at least one legal move (early exit on the first found). */
export function hasAnyLegalMove(game: Game, color: Color): boolean {
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            if (game.board[y][x].color !== color) continue;
            if (getLegalMoves(game, { x, y }).length > 0) return true;
        }
    }
    return false;
}

// ===== Layer 3: public API =====

/**
 * Legal destination squares for the piece on `from`, including castling.
 * Uses the piece's own colour and ignores `game.nextTurn` and `game.state`
 * (so the client can highlight moves at any time; `isLegalMove` enforces turn).
 * Returns [] for an invalid `from` or an empty square.
 */
export function getLegalMoves(game: Game, from: Coord): Coord[] {
    if (!isValidCoordInput(from)) return [];
    const sq = getSquare(game.board, from);
    if (sq.color === null) return [];
    const { color, piece } = sq;
    const startSq = { x: from.x, y: from.y };
    return [...pseudoLegalTargets(game, startSq), ...castlingTargets(game, startSq)].filter(
        (endSq) => leavesKingSafe(game, { color, startSq, endSq, piece }),
    );
}

/**
 * True if `move` is legal in `game`. Treats `move` as untrusted and never throws.
 * Rejects when the game is over (WIN_WHITE, WIN_BLACK, STALEMATE, DRAW, END),
 * when it is not `move.color`'s turn, when `move.piece`/`move.color` do not match
 * the board, or when the move would leave the mover's king in check.
 * Promotion: on a pawn reaching the last rank `promotion` may be omitted (queen)
 * or be N/B/R/Q; on any other move `promotion` must be absent.
 */
export function isLegalMove(game: Game, move: Move): boolean {
    const terminal: readonly State[] = ["WIN_WHITE", "WIN_BLACK", "STALEMATE", "DRAW", "END"];
    if (terminal.includes(game.state)) return false;

    if (typeof move !== "object" || move === null) return false;
    if (!isValidCoordInput(move.startSq) || !isValidCoordInput(move.endSq)) return false;
    if (move.color !== "W" && move.color !== "B") return false;
    if (move.color !== game.nextTurn) return false;

    const sq = getSquare(game.board, move.startSq);
    if (sq.color !== move.color || sq.piece !== move.piece) return false;

    const isPromotion = move.piece === "P" && move.endSq.y === promotionRank(move.color);
    if (move.promotion != null) {
        if (!isPromotion || !isPromotionPiece(move.promotion)) return false;
    }

    return getLegalMoves(game, move.startSq).some((t) => coordEquals(t, move.endSq));
}

/**
 * Returns a new Game with `move` played: board, turn, history (normalized move,
 * promotion filled in, default "Q"), castling rights, en passant square and state.
 * Throws Error("Illegal move") if `isLegalMove` is false. `game` is not modified.
 */
export function makeMove(game: Game, move: Move): Game {
    if (!isLegalMove(game, move)) {
        throw new Error("Illegal move");
    }
    const isPromotion = move.piece === "P" && move.endSq.y === promotionRank(move.color);
    const normalized: Move = {
        color: move.color,
        startSq: { x: move.startSq.x, y: move.startSq.y },
        endSq: { x: move.endSq.x, y: move.endSq.y },
        piece: move.piece,
        ...(isPromotion ? { promotion: move.promotion ?? "Q" } : {}),
    };
    const next: Game = {
        ...game,
        board: applyMoveToBoard(game.board, normalized, game.enPassant),
        nextTurn: opposite(game.nextTurn),
        history: [...game.history, normalized],
        ...nextCastlingRights(game, normalized),
        enPassant: nextEnPassant(normalized),
        state: "NONE",
    };
    return { ...next, state: getGameState(next) };
}

/**
 * State of the position for the side to move (`game.nextTurn`), derived purely
 * from the position (ignores `game.state`, never returns "END"):
 * no legal moves -> checkmate ("WIN_WHITE"/"WIN_BLACK" for the winner) or "STALEMATE";
 * else insufficient material -> "DRAW"; else "CHECK" or "NONE".
 */
export function getGameState(game: Game): State {
    const color = game.nextTurn;
    const inCheck = isInCheck(game.board, color);
    if (!hasAnyLegalMove(game, color)) {
        if (inCheck) return color === "W" ? "WIN_BLACK" : "WIN_WHITE";
        return "STALEMATE";
    }
    if (hasInsufficientMaterial(game.board)) return "DRAW";
    return inCheck ? "CHECK" : "NONE";
}
