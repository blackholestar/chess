import type { Color, Game, Piece, Square } from '../shared/types';

const backRank: Piece[] = ["R", "N", "B", "Q", "K", "B", "N", "R"];
const createPieceRank = (color: Color, pieces: Piece[]): Square[] =>
    pieces.map((piece) => ({ color, piece }));
const createEmptyRank = (): Square[] =>
    Array.from({ length: 8 }, () => ({ color: null, piece: null }));

export const initialGameState: Game = {
    nextTurn: "W",
    history: [],
    state: "NONE",
    board: [
        createPieceRank("W", backRank),
        createPieceRank("W", Array(8).fill("P")),
        createEmptyRank(),
        createEmptyRank(),
        createEmptyRank(),
        createEmptyRank(),
        createPieceRank("B", Array(8).fill("P")),
        createPieceRank("B", backRank),
    ],
    whiteCastlingKingside: true,
    whiteCastlingQueenside: true,
    blackCastlingKingside: true,
    blackCastlingQueenside: true,
    enPassant: null,
};