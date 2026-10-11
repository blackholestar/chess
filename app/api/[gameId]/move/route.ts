import {gameManager} from "@/server/gameManager";
import { Move } from "@/shared/types";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ gameId: string }> }
) {
    // makes move and returns storedGame
    try {
        const { gameId } = await params;
        const { move } = await request.json();
        const response = (await gameManager.move(gameId, move));
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