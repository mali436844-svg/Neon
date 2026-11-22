"use client";

import { useEffect, useState } from "react";
import type { GameConfig } from "./Game";
import type { Difficulty } from "@/lib/ai";
import { loadHighScores, clearHighScores, type HighScore } from "@/lib/highscores";
import { sfx } from "@/lib/sound";
import { PieceSvg } from "./PieceSvg";

type Props = {
  name: string;
  setName: (n: string) => void;
  onStart: (c: GameConfig) => void;
  busy: boolean;
  error: string | null;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
};

type OpenGame = { code: string; whiteName: string; blackName: string | null; status: string; featured: number };
type GlobalScore = { id: number; name: string; score: number; mode: string; result: string };

export default function StartScreen({ name, setName, onStart, busy, error, onCreateRoom, onJoinRoom }: Props) {
  const [tab, setTab] = useState<"ai" | "local" | "online">("ai");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [color, setColor] = useState<"w" | "b" | "r">("w");
  const [code, setCode] = useState("");
  const [scoresTab, setScoresTab] = useState<"local" | "global">("local");
  const [local, setLocal] = useState<HighScore[]>([]);
  const [global, setGlobal] = useState<GlobalScore[]>([]);
  const [rooms, setRooms] = useState<OpenGame[]>([]);
  const [engine, setEngine] = useState<{ online: boolean; python?: string } | null>(null);

  useEffect(() => {
    setLocal(loadHighScores());
    fetch("/api/engine/status")
      .then((r) => r.json())
      .then((d: { online: boolean; python?: string }) => setEngine(d))
      .catch(() => setEngine({ online: false }));
    fetch("/api/scores")
      .then((r) => r.json())
      .then((d: { scores?: GlobalScore[] }) => setGlobal(d.scores ?? []))
      .catch(() => { });
  }, []);

  useEffect(() => {
    if (tab !== "online") return;
    const load = () =>
      fetch("/api/games", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { games?: OpenGame[] }) => setRooms(d.games ?? []))
        .catch(() => { });
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [tab]);

  const startAi = (d: Difficulty = difficulty, c: "w" | "b" | "r" = color) => {
    sfx.unlock();
    sfx.promote();
    const pc = c === "r" ? (Math.random() < 0.5 ? "w" : "b") : c;
    onStart({ mode: "ai", difficulty: d, playerColor: pc });
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Enter") startAi();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  return (
    <div className="start-root">
      <div className="floaters" aria-hidden>
        {["k", "q", "n", "b", "r", "p", "n", "q"].map((t, i) => (
          <div key={i} className="floater" style={{ "--i": i } as React.CSSProperties}>
            <PieceSvg type={t} color={i % 2 ? "b" : "w"} />
          </div>
        ))}
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 py-8">
        <div className="text-center">
          <h1 className="logo">NEON GAMBIT</h1>
          <p className="mt-1 text-sm tracking-[0.25em] text-white/50 uppercase">Arcade chess · Combos · ByAli</p>
          {engine && (
            <span className={`engine-badge mt-2 inline-block ${engine.online ? "python" : "browser"}`}>
              {engine.online ? `🐍 Python game controller online · ${engine.python}` : "⚡ Browser engine mode"}
            </span>
          )}
        </div>

        <button className="btn-hero" onClick={() => startAi()}>
          ▶ QUICK PLAY
          <span className="block text-xs font-normal tracking-widest opacity-70">vs CPU · press Enter</span>
        </button>

        <div className="grid w-full gap-4 md:grid-cols-[1.3fr_1fr]">
          <div className="panel">
            <label className="mb-3 block">
              <span className="text-xs uppercase tracking-widest text-white/40">Your name</span>
              <input
                className="input mt-1 w-full"
                value={name}
                maxLength={16}
                placeholder="Player"
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <div className="tabs mb-4">
              {(
                [
                  ["ai", "🤖 vs Computer"],
                  ["local", "👥 2 Players"],
                  ["online", "🌐 Online"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  className={tab === k ? "on" : ""}
                  onClick={() => {
                    sfx.click();
                    setTab(k);
                  }}
                >
                  {l}
                </button>
              ))}
            </div>

            {tab === "ai" && (
              <div className="space-y-4">
                <div>
                  <div className="mb-2 text-xs uppercase tracking-widest text-white/40">Difficulty</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
                      <button
                        key={d}
                        className={`choice ${difficulty === d ? "on" : ""}`}
                        onClick={() => {
                          sfx.click();
                          setDifficulty(d);
                        }}
                      >
                        <div className="font-bold capitalize">{d}</div>
                        <div className="text-[10px] text-white/50">×{d === "easy" ? 1 : d === "medium" ? 2 : 3} win bonus</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs uppercase tracking-widest text-white/40">Play as</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ["w", "White"],
                        ["b", "Black"],
                        ["r", "Random"],
                      ] as const
                    ).map(([c, l]) => (
                      <button
                        key={c}
                        className={`choice ${color === c ? "on" : ""}`}
                        onClick={() => {
                          sfx.click();
                          setColor(c);
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <button className="btn-primary w-full text-lg" onClick={() => startAi()}>
                  Start game
                </button>
              </div>
            )}

            {tab === "local" && (
              <div className="space-y-3">
                <p className="text-sm text-white/60">
                  Pass-and-play on one device. Both sides score points — the winner&apos;s score goes on the board.
                </p>
                <button
                  className="btn-primary w-full text-lg"
                  onClick={() => {
                    sfx.unlock();
                    sfx.promote();
                    onStart({ mode: "local", difficulty: "medium", playerColor: "w" });
                  }}
                >
                  Start 2-player game
                </button>
              </div>
            )}

            {tab === "online" && (
              <div className="space-y-3">
                <button className="btn-primary w-full" disabled={busy} onClick={onCreateRoom}>
                  {busy ? "…" : "+ Create room (you play White)"}
                </button>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (code.trim()) onJoinRoom(code.trim().toUpperCase());
                  }}
                >
                  <input
                    className="input flex-1 font-mono uppercase tracking-widest"
                    placeholder="ROOM CODE"
                    value={code}
                    maxLength={8}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <button className="btn-ghost" type="submit" disabled={busy}>
                    Join
                  </button>
                </form>
                {error && <div className="text-sm text-rose-400">{error}</div>}
                <div>
                  <div className="mb-1 text-xs uppercase tracking-widest text-white/40">Live rooms</div>
                  <div className="max-h-44 space-y-1 overflow-y-auto">
                    {rooms.length === 0 && <div className="text-xs text-white/30">No open rooms — create one!</div>}
                    {rooms.map((r) => (
                      <button key={r.code} className="room-row" onClick={() => onJoinRoom(r.code)}>
                        <span className="font-mono text-cyan-300">{r.code}</span>
                        <span className="flex-1 truncate px-2 text-left text-white/70">
                          {r.featured ? "★ " : ""}
                          {r.whiteName} vs {r.blackName ?? "—"}
                        </span>
                        <span className={`text-[10px] uppercase ${r.status === "waiting" ? "text-emerald-300" : "text-white/40"}`}>
                          {r.status === "waiting" ? "Join" : "Watch"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="tabs mb-3">
              <button className={scoresTab === "local" ? "on" : ""} onClick={() => setScoresTab("local")}>
                🏆 Your best
              </button>
              <button className={scoresTab === "global" ? "on" : ""} onClick={() => setScoresTab("global")}>
                🌍 Global
              </button>
            </div>
            <ol className="space-y-1 text-sm">
              {(scoresTab === "local" ? local : global).length === 0 && (
                <li className="py-6 text-center text-white/30">No scores yet. Go set one!</li>
              )}
              {(scoresTab === "local" ? local : global).slice(0, 10).map((h, i) => (
                <li key={i} className="score-row">
                  <span className={`rank r${i}`}>{i + 1}</span>
                  <span className="flex-1 truncate">
                    {h.name}
                    <span className="ml-1 text-[10px] text-white/40">{h.mode}</span>
                  </span>
                  <span className="font-mono text-cyan-300">{h.score.toLocaleString()}</span>
                </li>
              ))}
            </ol>
            {scoresTab === "local" && local.length > 0 && (
              <button
                className="mt-3 text-xs text-white/30 hover:text-white/60"
                onClick={() => {
                  if (window.confirm("Clear local high scores?")) {
                    clearHighScores();
                    setLocal([]);
                  }
                }}
              >
                Clear local scores
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-white/40">
          <span>
            <kbd>Enter</kbd> quick play
          </span>
          <span>
            <kbd>Arrows</kbd> + <kbd>Space</kbd> to move
          </span>
          <span>
            <kbd>P</kbd> pause
          </span>
          <a href="/admin" className="underline hover:text-white/70">
            Admin console
          </a>
        </div>
      </div>
    </div>
  );
}
