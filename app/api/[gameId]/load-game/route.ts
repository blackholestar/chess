import {gameManager} from "@/server/gameManager";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ gameId: string }> }
) {
    // returns full StoredGame (needed to determine version)
    try {
        const { gameId } = await params;
        const response = (await gameManager.loadGame(gameId));
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