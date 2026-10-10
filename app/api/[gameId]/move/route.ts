import {gameManager} from "@/server/gameManager";
import { Move } from "@/shared/types";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ move: Move }> }
) {
    
    try {
        const { move } = await params;
        const response = (await gameManager.move(move)).game;
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