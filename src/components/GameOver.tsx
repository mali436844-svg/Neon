"use client";

import { useEffect, useState } from "react";
import { qualifies, saveHighScore, getName, setName, loadHighScores, type HighScore } from "@/lib/highscores";
import type { OverState } from "./Game";
import type { Difficulty } from "@/lib/ai";

type Props = {
  over: OverState;
  mode: "ai" | "local" | "online";
  difficulty: Difficulty;
  score: number;
  moves: number;
  elapsed: number;
  stats: { captures: number; checks: number; bestCombo: number };
  won: boolean;
  playerName: string;
  history: string[];
  playerColor?: "w" | "b";
  onRestart: () => void;
  onExit: () => void;
};

export default function GameOver(p: Props) {
  const [isHigh, setIsHigh] = useState(false);
  const [name, setNameState] = useState(p.playerName || "");
  const [saved, setSaved] = useState(false);
  const [list, setList] = useState<HighScore[]>([]);
  const [shown, setShown] = useState(0);
  const [verify, setVerify] = useState<{ engine: string; verified?: number; adjusted?: boolean } | null>(null);

  useEffect(() => {
    setIsHigh(qualifies(p.score));
    setNameState(p.playerName || getName() || "");
    setList(loadHighScores());
    // count-up animation
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      setShown(Math.round(p.score * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [p.score, p.playerName]);

  const modeLabel = p.mode === "ai" ? `CPU ${p.difficulty}` : p.mode === "local" ? "2P local" : "Online";

  const save = async () => {
    if (saved) return;
    const n = name.trim().slice(0, 16) || "Player";
    setName(n);
    const entry: HighScore = { name: n, score: p.score, mode: modeLabel, result: p.over.text, date: Date.now() };
    setList(saveHighScore(entry));
    setSaved(true);
    try {
      const r = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: n,
          score: p.score,
          mode: p.mode,
          label: modeLabel,
          difficulty: p.difficulty,
          playerColor: p.playerColor,
          result: p.over.text,
          history: p.history,
        }),
      });
      const d = (await r.json()) as { verification?: { engine: string; verified?: number; adjusted?: boolean } };
      if (d.verification) setVerify(d.verification);
    } catch {
      /* ignore */
    }
  };

  const title = p.over.winner === null ? "DRAW" : p.won ? (p.mode === "local" ? "CHECKMATE" : "VICTORY") : "DEFEAT";
  const titleCls = p.over.winner === null ? "text-violet-300" : p.won ? "text-cyan-300" : "text-rose-400";

  return (
    <div className="overlay">
      <div className="panel pop-in max-h-[92dvh] w-[min(94vw,420px)] overflow-y-auto text-center">
        <div className={`title-lg ${titleCls}`}>{title}</div>
        <div className="mb-4 text-sm text-white/60">{p.over.text}</div>

        <div className="text-xs uppercase tracking-widest text-white/40">Score</div>
        <div className="mb-3 font-mono text-5xl font-black text-white tabular-nums drop-shadow-[0_0_20px_rgba(34,211,238,0.6)]">
          {shown.toLocaleString()}
        </div>

        <div className="mb-4 grid grid-cols-4 gap-2 text-xs">
          <Stat label="Moves" value={Math.ceil(p.moves / 2)} />
          <Stat label="Captures" value={p.stats.captures} />
          <Stat label="Checks" value={p.stats.checks} />
          <Stat label="Combo" value={`x${p.stats.bestCombo}`} />
        </div>

        {isHigh && !saved && (
          <form
            className="mb-4 rounded-xl border border-yellow-400/40 bg-yellow-400/10 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="mb-2 text-sm font-bold text-yellow-300">★ New high score!</div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={name}
                maxLength={16}
                autoFocus
                placeholder="Your name"
                onChange={(e) => setNameState(e.target.value)}
              />
              <button className="btn-primary" type="submit">
                Save
              </button>
            </div>
          </form>
        )}

        {saved && (
          <div className="mb-3 text-xs text-white/50">
            {!verify
              ? "Submitting to global leaderboard…"
              : verify.engine === "python"
                ? verify.adjusted
                  ? `🐍 Python replay adjusted global score to ${verify.verified?.toLocaleString()}`
                  : "🐍 Score verified by Python game controller ✓"
                : "Saved to global leaderboard (unverified)"}
          </div>
        )}

        {(saved || !isHigh) && list.length > 0 && (
          <div className="mb-4 text-left">
            <div className="mb-1 text-xs uppercase tracking-widest text-white/40">Local high scores</div>
            <ol className="space-y-0.5 text-sm">
              {list.slice(0, 5).map((h, i) => (
                <li
                  key={i}
                  className={`flex justify-between rounded px-2 py-0.5 ${saved && h.date && h.score === p.score && h.name === (name.trim() || "Player") ? "bg-cyan-400/15" : ""}`}
                >
                  <span className="truncate">
                    <span className="mr-2 text-white/40">{i + 1}.</span>
                    {h.name} <span className="text-xs text-white/40">· {h.mode}</span>
                  </span>
                  <span className="font-mono text-cyan-300">{h.score.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {p.mode !== "online" ? (
            <button className="btn-primary text-lg" onClick={p.onRestart} autoFocus={!isHigh}>
              ↻ Play again <span className="opacity-60">(R)</span>
            </button>
          ) : null}
          <button className="btn-ghost" onClick={p.onExit}>
            ⌂ Main menu
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white/5 py-2">
      <div className="font-mono text-base font-bold text-white">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
    </div>
  );
}
