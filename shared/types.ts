export type Color = "W" | "B";
export type Piece = "P" | "N" | "B" | "R" | "Q" | "K";

export type Coord = {
    x: number,
    y: number,
}

export type State = "NONE" | "CHECK" | "WIN_WHITE" | "WIN_BLACK" | "STALEMATE" | "DRAW" | "END";

export type Square = 
| {
    color: Color,
    piece: Piece,
}
| {
    color: null,
    piece: null,
}

export type Move = {
    color: Color,
    startSq: Coord,
    endSq: Coord,
    piece: Piece,
    promotion?: Exclude<Piece, "P" | "K">
}
export type Board = Square[][];

// game-specific data (sent to client)
export type Game = {
    board: Board,
    nextTurn: Color,
    history: Move[],
    state: State,

    whiteCastlingKingside: boolean,
    whiteCastlingQueenside: boolean,
    blackCastlingKingside: boolean,
    blackCastlingQueenside: boolean,

    enPassant: Coord|null

}

// also includes database-specific info
export type StoredGame = {
    id: string,
    game: Game,
    version: number
}