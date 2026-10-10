import {gameManager} from "@/server/gameManager";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ gameId: string }> }
) {
    // returns only Game, not StoredGame
    try {
        const { gameId } = await params;
        const response = (await gameManager.loadGame(gameId)).game;
        return Response.json({
            success: true,
            game: response,
        });
    } catch (error) {
        console.log(error);
        return Response.json({
            success: false,
            game: null,
            error: error instanceof Error ? error.message : String(error),
        }, {status: 500});
    }
}