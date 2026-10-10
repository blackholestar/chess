"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
    const router = useRouter();
    const [gameId, setGameId] = useState("");

    async function createGame() {
        const response = await fetch("/api/create-game", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        });
        const data = await response.json();
        if (!response.ok || data.error != null) {
            console.log(data);
            alert(typeof data.error === "string" ? data.error : "Failed to create game");
        } else {
            router.push(`/game/${data.gameId}`);
        }
    }
    return (
        <div>
            Chess
            <button onClick={() => createGame()}>Create Game</button>
        </div>
    )
}