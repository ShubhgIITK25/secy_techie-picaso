"use client";

import {useRouter} from "next/navigation";
import { useState } from "react";

export default function Home() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");

  const createRoomId = () => {
    const min = 100000;
    const max = 999999;
    return String(Math.floor(min + Math.random() * (max - min + 1)));
  };

  const joinRoom = () => {
    const nextRoomId = roomId.trim();
    if(!nextRoomId) return;
    router.push(`/room/${encodeURIComponent(nextRoomId)}`);
  };

const createRoom = () => {
  const nextRoomId = createRoomId();
  router.push(`/room/${encodeURIComponent(nextRoomId)}`);
}

return(
    <div className="min-h-screen bg-[#f7f1e3] px-4 py-10 text-black">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center">
        <div className="w-full space-y-4 rounded-2xl border border-[#eadfca] bg-[#f3e7cf] p-6 shadow-sm">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Enter a room</h1>
            <p className="text-sm text-black/70">Join a room by ID or create a new one.</p>
          </div>

        <input
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            placeholder="Room ID"
            className="w-full rounded-xl border border-black/10 bg-[#f7f1e3] px-4 py-3 text-black outline-none placeholder:text-black/40"
         />
                   <button
            onClick={joinRoom}
            className="w-full rounded-xl bg-black px-4 py-3 font-medium text-[#f7f1e3]"
          >
            Join room
          </button>

          <button
            onClick={createRoom}
            className="w-full rounded-xl border border-black/10 px-4 py-3 font-medium text-black"
          >
            Create room
          </button>
          </div>
          </div>
          </div>
)
}