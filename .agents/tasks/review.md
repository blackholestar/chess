# Self-contained chess rules engine in shared/rules.ts

`shared/rules.ts` is now a layered, pure rules engine: geometry primitives, pseudo-legal movement, attack detection, game-aware rules (castling, en passant, promotion, rights bookkeeping), and a four-function public API (`getLegalMoves`, `isLegalMove`, `makeMove`, `getGameState`). Legality works by applying each candidate move to a cloned board and checking whether the mover's king is attacked. That one check covers pins, check evasion, and the en passant rank-discovery case. The file imports only types from `./types`. The only change outside it is the board-orientation fix in `server/data.ts`, which puts White on `board[0]` to match the agreed convention. `shared/types.ts` already had `STALEMATE`, `DRAW` and `Move.promotion` before the plan was written, so the coder left it alone. My independent perft run matches every required number.

Watch for: `enPassant` is set after every double push, even when no enemy pawn is adjacent (confirmed). This follows plan Decision 11 and doesn't change which moves are legal. It will matter once threefold repetition is added. Also, `getLegalMoves` returns squares only, so the caller has to expand the four promotion choices itself (confirmed, by design).

**Verdict**: APPROVED

## High-level view

Move generation is turn-agnostic and state-agnostic, so the client can highlight moves at any time. `isLegalMove` is the gate. It treats the move as untrusted and rejects it when the game is over, when the colour doesn't match `nextTurn`, when the claimed piece or colour doesn't match the board, when a coordinate is malformed, or when the promotion is invalid. Then it checks the destination against `getLegalMoves`. `makeMove` calls the same gate, throws on an illegal move, and builds a new `Game` with a normalized history entry.

Castling, en passant and promotion are all handled inside `applyMoveToBoard`, keyed on move shape. A king moving two files moves the rook. A pawn moving diagonally onto the empty en passant square removes the captured pawn. A pawn reaching the last rank becomes `promotion ?? "Q"`. Because the king-safety check runs on that same board, the special moves get the same pin and discovery handling as ordinary moves.

Castling rights are cleared on any king move and on any move from or to a corner square. That covers both a rook leaving home and a rook being captured at home. `getGameState` works only from the position. It returns `WIN_*` for checkmate, `STALEMATE`, `DRAW` (insufficient material only), `CHECK` or `NONE`. It never returns `END`, and if a caller recomputes the state from the position, it will overwrite a stored `END`.

Perft (my run, public API only, promotions expanded ×4): Start d1–d4 = 20 / 400 / 8902 / 197281. Kiwipete d1–d3 = 48 / 2039 / 97862. Position 3 d1–d3 = 14 / 191 / 2812. All match exactly.

<details>
<summary>Issues (3)</summary>

1. **En passant square set unconditionally** — `nextEnPassant` sets `enPassant` after every double push, even with no adjacent enemy pawn (confirmed). Move generation is unaffected because `pawnTargets` re-checks for a victim pawn. Before adding threefold repetition, either set it only when a capture is possible or normalize it when comparing positions.
2. **Promotion choice is the caller's job** — `getLegalMoves` returns `Coord[]`, so nothing in the API produces the four promotion moves. The client or gameManager has to detect a pawn reaching the last rank and ask for N/B/R/Q, or it will always get the queen by default (confirmed, by design). Note this for the client work.
3. **`getGameState` overwrites `END`** — the state is derived only from the position, so a stored `END` (for example after a resignation) is lost if a caller recomputes it (confirmed, documented). gameManager should keep `END` instead of calling `getGameState` again on a finished game.

</details>

<details>
<summary>Details</summary>

### En passant semantics

`game.enPassant` is the skipped square the capturing pawn moves to. `pawnTargets` only accepts it when that square is diagonally forward of the pawn, on rank 6 for White or rank 3 for Black, empty, and next to an enemy pawn on the capturer's rank. So stale or forged `enPassant` values from outside can't create a phantom capture. `applyMoveToBoard` removes the pawn on `{x: end.x, y: start.y}`. The king-safety check runs after that removal, so the horizontal discovered check is caught. Position 3 perft exercises this, and a dedicated `K..pP..r` spot-check rejected the capture.

The issue is on the setting side. `nextEnPassant` always records the skipped square after a double push (plan Decision 11). The focus brief asked for it to be set only when an enemy pawn is adjacent. Legality is the same either way. The difference only shows up in position identity: two otherwise identical positions can differ in `enPassant`, which will break a naive repetition check later.

### Promotion handling

`isLegalMove` rejects a `promotion` field on any move that isn't a pawn reaching its last rank, and rejects any value outside N/B/R/Q (`promotion: "K"` was rejected in my run). If the field is missing on a promoting move, the move is legal and `makeMove` records it in history as `"Q"`. Moves that don't promote never carry the field, which matches Decision 9. The four promotion pieces are distinct moves at the `makeMove` level. Perft confirms this, since Kiwipete and Position 3 both include promotions or under-promotions within the tested depths. `getLegalMoves` itself can't express them, though.

### Verification evidence

The coder's verification note wasn't included in this step's inputs. To make up for it, I ran the plan's narrow type check once (`npx tsc --noEmit --strict --skipLibCheck ... shared/types.ts shared/rules.ts server/data.ts`), and it exited 0 with no output. Beyond perft, 13 targeted checks in a temporary `/tmp/perft-review.ts` (now deleted) all passed: queenside castling allowed with b1 attacked, refused with d1 attacked, refused when the rook is missing; `h1xh8` clearing both kingside rights; the en passant rank pin; promotion `"K"` rejected, default `"Q"`, `"N"` honoured, promotion on a move that doesn't promote rejected; the input game unchanged after `makeMove` (`JSON.stringify` compared); and rejection on a finished game, the wrong turn, and garbage input. `package.json`, `app/page.tsx` and `app/api`/`app/game` were already modified before this task (their timestamps are earlier than the plan), so they aren't part of this change.

</details>

<details>
<summary>File map</summary>

- `shared/rules.ts`: new layered rules engine (primitives, pseudo-legal movement, attack detection, castling/en passant/promotion/rights, public API).
- `server/data.ts`: initial board rows reordered so `board[0]` is White's back rank.
- `shared/types.ts`: no changes from this task.

The full source is in `shared/rules.ts`. `shared/` and `server/` are untracked in git, so `git diff` doesn't show them.

</details>
