"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RoomIndexPage() {
  const [roomId, setRoomId] = useState("");
  const router = useRouter();

  const createRoomId = () => {
    const min = 100000;
    const max = 999999;
    return String(Math.floor(min + Math.random() * (max - min + 1)));
  };

  const createRoom = () => {
    const id = createRoomId();
    router.push(`/room/${id}`);
  };

  const joinRoom = () => {
    if (!roomId) return;
    router.push(`/room/${encodeURIComponent(roomId)}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="p-8 rounded-lg bg-white shadow-lg w-full max-w-md">
        <h2 className="text-2xl font-semibold mb-4">Join or Create a Room</h2>

        <div className="flex gap-2 mb-4">
          <input
            className="flex-1 px-3 py-2 border rounded"
            placeholder="Enter room id to join"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button
            onClick={joinRoom}
            className="px-4 py-2 bg-zinc-900 text-white rounded"
          >
            Join
          </button>
        </div>

        <div className="text-center">
          <button
            onClick={createRoom}
            className="px-6 py-3 bg-indigo-600 text-white rounded"
          >
            Create New Room
          </button>
        </div>
      </div>
    </div>
  );
}
