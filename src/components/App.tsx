"use client";

import { useCallback, useEffect, useState } from "react";
import Game, { type GameConfig } from "./Game";
import StartScreen from "./StartScreen";
import { PieceGradients } from "./PieceSvg";
import { getName, setName as storeName } from "@/lib/highscores";
import { sfx } from "@/lib/sound";
import { loadRules } from "@/lib/rules";

type Seat = { token: string | null; color: "w" | "b" | null };

function loadSeat(code: string): Seat | null {
  try {
    const v = localStorage.getItem(`neon-chess-seat-${code}`);
    return v ? (JSON.parse(v) as Seat) : null;
  } catch {
    return null;
  }
}
function saveSeat(code: string, s: Seat) {
  localStorage.setItem(`neon-chess-seat-${code}`, JSON.stringify(s));
}

export default function App() {
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const [name, setNameState] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setName = (n: string) => {
    setNameState(n);
    storeName(n);
  };

  const start = (c: GameConfig) => {
    setConfig(c);
    setGameKey((k) => k + 1);
  };

  const setRoomUrl = (code: string | null) => {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set("room", code);
    else url.searchParams.delete("room");
    window.history.replaceState(null, "", url.toString());
  };

  const joinRoom = useCallback(
    async (code: string) => {
      setBusy(true);
      setError(null);
      sfx.unlock();
      try {
        const existing = loadSeat(code);
        if (existing?.token) {
          const r = await fetch(`/api/games/${code}`);
          if (r.ok) {
            setRoomUrl(code);
            start({ mode: "online", difficulty: "medium", playerColor: existing.color ?? "w", online: { code, ...existing } });
            return;
          }
        }
        const r = await fetch(`/api/games/${code}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: getName() || "Black" }),
        });
        const d = (await r.json()) as { code?: string; token?: string | null; color?: "w" | "b" | null; error?: string };
        if (!r.ok || !d.code) throw new Error(d.error ?? "Could not join");
        const seat: Seat = { token: d.token ?? null, color: d.color ?? null };
        if (seat.token) saveSeat(d.code, seat);
        setRoomUrl(d.code);
        start({ mode: "online", difficulty: "medium", playerColor: seat.color ?? "w", online: { code: d.code, ...seat } });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not join");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const createRoom = async () => {
    setBusy(true);
    setError(null);
    sfx.unlock();
    try {
      const r = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || "White" }),
      });
      const d = (await r.json()) as { code?: string; token?: string; error?: string };
      if (!r.ok || !d.code || !d.token) throw new Error(d.error ?? "Could not create room");
      saveSeat(d.code, { token: d.token, color: "w" });
      setRoomUrl(d.code);
      start({ mode: "online", difficulty: "medium", playerColor: "w", online: { code: d.code, token: d.token, color: "w" } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setNameState(getName());
    void loadRules();
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) void joinRoom(room.toUpperCase());
  }, [joinRoom]);

  return (
    <>
      <PieceGradients />
      {config ? (
        <Game
          key={gameKey}
          config={config}
          playerName={name}
          onExit={() => {
            setConfig(null);
            setRoomUrl(null);
          }}
          onRestart={() => {
            sfx.promote();
            setGameKey((k) => k + 1);
          }}
        />
      ) : (
        <StartScreen
          name={name}
          setName={setName}
          onStart={start}
          busy={busy}
          error={error}
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
        />
      )}
    </>
  );
}
