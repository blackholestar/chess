import type { Move, Game, StoredGame } from '../shared/types';
import { supabase } from './supabase';
import { initialGameState } from './data';

class GameManager {
    constructor() {

    }

    async createGame(): Promise<number> {
        // create new game: returns game id of created game
        while (true) {
            const id = Math.floor(Math.random() * (99999 - 10000) + 10000);
            const game = initialGameState;
            const { error } = await supabase
                .from("Game")
                .insert({
                    id: id,
                    version: 0,
                    game: game
                })
                .select()
                .single();
            if (!error) {
                return id;
            }
            if (error.code != "23505") {
                throw new Error(error.message);
            }

        }
    }

    async loadGame(gameId: string): Promise<StoredGame> {
        // load entire game (lowest level)
        const { data, error } = await supabase
            .from("Game")
            .select("id, version, game")
            .eq("id", gameId)
            .single();
        if (error) {
            if (error.code === "PGRST116") {
                // game id does not exist
                throw new Error("This game id does not exist");
            }
            throw new Error(error.message);
        }
        return data as StoredGame;
    }

    async saveGame(storedGame: StoredGame): Promise<void> {
        // save entire game (lowest level)
        const {data, error} = await supabase
            .from("Game")
            .update({
                version: storedGame.version + 1,
                game: storedGame.game
            })
            .eq("id", storedGame.id)
            .eq("version", storedGame.version)
            .select("id");
        if (error) {
            throw new Error("Failed to save game");
        }

        if (data === null || data.length === 0) {
            throw new Error("Version conflict");
        }
    }

    async move(move: Move): Promise<StoredGame> {
        // TODO: query databaes, check legality of move, make move, and update client and database
        throw new Error("not implemented");
    }
}

const gameManager = new GameManager();
export {gameManager};