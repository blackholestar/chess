import {gameManager} from "@/server/gameManager";
import { Move } from "@/shared/types";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ gameId: string }> }
) {
    // makes move and returns storedGame
    try {
        const { gameId } = await params;
        const response = (await gameManager.resetGame(gameId)).game;
        return Response.json({
            success: true,
            data: response,
        });
    } catch (error) {
        console.log(error);
        return Response.json({
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }, {status: 500});
    }
}