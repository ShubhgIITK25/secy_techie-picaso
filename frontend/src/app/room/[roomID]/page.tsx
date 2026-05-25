"use client";

import InfiniteCanvas from "@/components/canvas/InfiniteCanvas";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type RoomMember = {
  clientId: string;
  displayName: string;
  isOwner: boolean;
  createdAt: string;
};

type RoomDetail = {
  roomId: string;
  ownerClientId: string;
  ownerDisplayName: string;
  occupancy: number;
  capacity: number;
  isOwner: boolean;
  members: RoomMember[];
};

export default function RoomPageClient() {
  const params = useParams();
  const router = useRouter();
  const roomID = useMemo(() => {
    const value = params?.roomID;
    if (Array.isArray(value)) {
      return value[0] ?? "";
    }
    return typeof value === "string" ? value : "";
  }, [params]);
  const [joined, setJoined] = useState(false);
  const [message, setMessage] = useState("");
  const [clientId, setClientId] = useState("");
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(false);

  useEffect(() => {
    if (!roomID) return;

    if (typeof window !== "undefined" && window.localStorage.getItem("auth_logged_in") !== "true") {
      router.replace("/login");
      return;
    }

    const clientIdKey = "room_client_id";
    let clientId = window.localStorage.getItem(clientIdKey);
    if (!clientId) {
      clientId = crypto.randomUUID();
      window.localStorage.setItem(clientIdKey, clientId);
    }

    setClientId(clientId);

    let alive = true;

    const joinRoom = async () => {
      const displayName = window.localStorage.getItem("auth_username") || window.localStorage.getItem("auth_email") || clientId;
      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ roomId: roomID, clientId, displayName }),
      });

      const data = await response.json().catch(() => ({}));

      if (!alive) return;

      if (!response.ok) {
        const fallbackMessage =
          response.status === 409
            ? "Room is full"
            : "Unable to join room. Please check backend/nginx and try again.";
        setMessage(data?.message || fallbackMessage);
        return;
      }

      setJoined(true);
      setMessage("");
    };

    void joinRoom();

    return () => {
      alive = false;
      void fetch("/api/rooms/leave", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ roomId: roomID, clientId }),
        keepalive: true,
      });
    };
  }, [roomID]);

  useEffect(() => {
    if (!joined || !roomID || !clientId) return;

    let alive = true;

    const fetchRoom = async () => {
      setLoadingRoom(true);
      try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(roomID)}?clientId=${encodeURIComponent(clientId)}`);
        const data = await response.json().catch(() => ({}));

        if (!alive) return;

        if (!response.ok) {
          setJoined(false);
          setRoom(null);
          setMessage(data?.message || "You no longer have access to this room.");
          return;
        }

        setRoom(data as RoomDetail);
        setMessage("");
      } finally {
        if (alive) {
          setLoadingRoom(false);
        }
      }
    };

    void fetchRoom();
    const interval = window.setInterval(() => {
      void fetchRoom();
    }, 3000);

    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [joined, roomID, clientId]);

  const kickMember = async (targetClientId: string) => {
    if (!room?.isOwner) return;

    const response = await fetch("/api/rooms/kick", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roomId: roomID,
        requesterClientId: clientId,
        targetClientId,
      }),
    });

    if (response.ok) {
      const refreshed = await fetch(`/api/rooms/${encodeURIComponent(roomID)}?clientId=${encodeURIComponent(clientId)}`);
      if (refreshed.ok) {
        setRoom((await refreshed.json()) as RoomDetail);
      }
    }
  };

  const handleLogout = () => {
    try {
      window.localStorage.removeItem("auth_logged_in");
      window.localStorage.removeItem("auth_username");
      window.localStorage.removeItem("auth_email");
    } catch {}
    router.push("/login");
  };

  return (
    <div className="w-screen h-screen">
      {!joined ? (
        <div className="flex h-full items-center justify-center bg-[#f7f1e3] px-4 text-black">
          <div className="w-full max-w-md rounded-2xl border border-[#eadfca] bg-[#f3e7cf] p-6 shadow-sm">
            <h1 className="text-2xl font-semibold">{message || "Joining room..."}</h1>
            {message && (
              <button
                onClick={() => router.push("/")}
                className="mt-4 rounded-xl bg-black px-4 py-3 font-medium text-[#f7f1e3]"
              >
                Go back
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col md:flex-row bg-[#f7f1e3] text-black">
          <aside className="w-full border-b border-[#eadfca] bg-[#f3e7cf] p-4 md:w-80 md:border-b-0 md:border-r">
            <div className="space-y-3">
              <div>
                <h2 className="text-xl font-semibold">Room dashboard</h2>
                <p className="text-sm text-black/70 break-all">Room ID: {roomID}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => router.push("/")}
                  className="rounded-xl border border-black/10 bg-[#f7f1e3] px-3 py-2 text-sm font-medium text-black hover:bg-black hover:text-[#f7f1e3]"
                >
                  Home
                </button>
                <button
                  onClick={handleLogout}
                  className="rounded-xl bg-black px-3 py-2 text-sm font-medium text-[#f7f1e3] hover:opacity-90"
                >
                  Logout
                </button>
              </div>

              <div className="rounded-xl border border-black/10 bg-[#f7f1e3] p-3 text-sm">
                <div className="font-medium">Owner</div>
                <div className="text-black/70">{room?.ownerDisplayName || "Loading..."}</div>
                <div className="mt-2 text-black/60">{room?.occupancy ?? 0} / {room?.capacity ?? 4} users</div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-black/60">Users in room</h3>
                <div className="space-y-2">
                  {(room?.members ?? []).map((member) => (
                    <div key={member.clientId} className="flex items-center justify-between rounded-xl border border-black/10 bg-[#f7f1e3] px-3 py-2">
                      <div>
                        <div className="text-sm font-medium">{member.displayName || "Unnamed user"}</div>
                      </div>
                      {room?.isOwner && !member.isOwner && member.clientId !== clientId && (
                        <button
                          onClick={() => void kickMember(member.clientId)}
                          className="rounded-lg border border-black/10 px-3 py-1 text-xs font-medium text-black hover:bg-black hover:text-[#f7f1e3]"
                        >
                          Kick
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {loadingRoom && <div className="text-xs text-black/60">Refreshing room list...</div>}
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            <InfiniteCanvas roomId={roomID} className="relative h-full w-full" />
          </main>
        </div>
      )}
    </div>
  );
}