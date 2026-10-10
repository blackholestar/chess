import {gameManager} from "@/server/gameManager";

export async function POST() {
    try {
        const response = await gameManager.createGame();
        return Response.json({
            success: true,
            gameId: response,
        });
    } catch (error) {
        console.log(error);
        return Response.json({
            success: false,
            gameId: null,
            error: error instanceof Error ? error.message : String(error),
        }, {status: 500});
    }
}