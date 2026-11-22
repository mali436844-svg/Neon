"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type AdminGame = {
  id: number;
  code: string;
  fen: string;
  moves: string[];
  whiteName: string;
  blackName: string | null;
  status: string;
  result: string | null;
  featured: number;
  updatedAt: string;
};
type Score = { id: number; name: string; score: number; mode: string; result: string; moves: number; createdAt: string };
type EngineProc = {
  name: string;
  alive: boolean;
  pid: number | null;
  pending: number;
  served: number;
  restarts: number;
  uptimeSec: number;
  lastError: string | null;
};
type Engine = {
  online: boolean;
  version?: string;
  python?: string;
  error?: string;
  stats?: { commands: Record<string, { count: number; totalMs: number }> };
  processes: EngineProc[];
};
type Data = {
  engine: Engine | null;
  games: AdminGame[];
  scores: Score[];
  stats: { totalGames: number; totalScores: number; active: number; waiting: number };
};

export default function AdminPage() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hostName, setHostName] = useState("Admin");
  const [bench, setBench] = useState<string | null>(null);

  const load = useCallback(async (k: string) => {
    const r = await fetch("/api/admin", { headers: { "x-admin-key": k }, cache: "no-store" });
    if (r.status === 401) {
      setAuthed(false);
      setErr("Wrong password");
      sessionStorage.removeItem("neon-admin-key");
      return;
    }
    setData((await r.json()) as Data);
    setAuthed(true);
    setErr(null);
    sessionStorage.setItem("neon-admin-key", k);
  }, []);

  useEffect(() => {
    const k = sessionStorage.getItem("neon-admin-key");
    if (k) {
      setKey(k);
      void load(k);
    }
  }, [load]);

  useEffect(() => {
    if (!authed) return;
    const iv = setInterval(() => void load(key), 3000);
    return () => clearInterval(iv);
  }, [authed, key, load]);

  const act = async (body: Record<string, unknown>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return null;
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": key },
      body: JSON.stringify(body),
    });
    const d = (await r.json()) as { code?: string; token?: string; error?: string };
    if (!r.ok) setErr(d.error ?? "Action failed");
    await load(key);
    return d;
  };

  const host = async () => {
    const d = await act({ action: "createFeatured", name: hostName });
    if (d?.code && d.token) {
      localStorage.setItem(`neon-chess-seat-${d.code}`, JSON.stringify({ token: d.token, color: "w" }));
      router.push(`/?room=${d.code}`);
    }
  };

  if (!authed) {
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <form
          className="panel pop-in w-[min(92vw,360px)]"
          onSubmit={(e) => {
            e.preventDefault();
            void load(key);
          }}
        >
          <div className="logo-sm mb-1 text-xl">NEON GAMBIT</div>
          <h1 className="mb-4 text-lg font-bold">Admin console</h1>
          <input
            className="input mb-3 w-full"
            type="password"
            placeholder="Admin password"
            value={key}
            autoFocus
            onChange={(e) => setKey(e.target.value)}
          />
          {err && <div className="mb-3 text-sm text-rose-400">{err}</div>}
          <button className="btn-primary w-full">Enter</button>
          <p className="mt-3 text-xs text-white/40">
            Password is set by the <code>ADMIN_PASSWORD</code> env var (default: <code>admin</code>).
          </p>
          <Link href="/" className="mt-2 block text-xs text-cyan-300 underline">
            ← Back to game
          </Link>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <div className="logo-sm text-xl">NEON GAMBIT</div>
          <h1 className="text-sm text-white/50">Admin console · auto-refreshing</h1>
        </div>
        <Link href="/" className="btn-ghost text-sm">
          ← Game
        </Link>
        <button
          className="btn-ghost text-sm"
          onClick={() => {
            sessionStorage.removeItem("neon-admin-key");
            setAuthed(false);
            setKey("");
          }}
        >
          Log out
        </button>
      </header>

      {err && <div className="rounded-lg bg-rose-500/15 p-2 text-sm text-rose-300">{err}</div>}

      {data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total games" value={data.stats.totalGames} />
          <StatCard label="Active now" value={data.stats.active} accent />
          <StatCard label="Waiting rooms" value={data.stats.waiting} />
          <StatCard label="Scores logged" value={data.stats.totalScores} />
        </div>
      )}

      {data?.engine && <EnginePanel engine={data.engine} bench={bench} onBench={async () => {
        setBench("Running benchmark…");
        const r = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-key": key },
          body: JSON.stringify({ action: "engineBench" }),
        });
        const d = (await r.json()) as {
          bench?: { nodes: number; ms: number; nps: number };
          ai?: { san: string; depth: number; nodes: number; ms: number };
          error?: string;
        };
        setBench(
          d.bench && d.ai
            ? `perft(3): ${d.bench.nodes} nodes in ${d.bench.ms}ms (${d.bench.nps.toLocaleString()} nps) · hard AI: ${d.ai.san} at depth ${d.ai.depth}, ${d.ai.nodes.toLocaleString()} nodes in ${d.ai.ms}ms`
            : (d.error ?? "Benchmark failed"),
        );
      }} onRestart={() => act({ action: "engineRestart" }, "Restart all Python engine processes?")} />}

      <section className="panel">
        <h2 className="mb-3 font-bold">Host a featured game</h2>
        <p className="mb-3 text-sm text-white/50">
          Creates a ★ featured room pinned at the top of the online lobby. You play White; the first visitor to join
          plays Black.
        </p>
        <div className="flex flex-wrap gap-2">
          <input className="input" value={hostName} onChange={(e) => setHostName(e.target.value)} maxLength={16} />
          <button className="btn-primary" onClick={host}>
            ★ Host &amp; play
          </button>
          <button className="btn-ghost" onClick={() => act({ action: "cleanup" }, "Delete finished and stale (6h+) games?")}>
            🧹 Clean up old games
          </button>
        </div>
      </section>

      <section className="panel overflow-x-auto">
        <h2 className="mb-3 font-bold">Online games</h2>
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="text-xs uppercase text-white/40">
            <tr>
              <th className="py-1">Room</th>
              <th>Players</th>
              <th>Status</th>
              <th>Moves</th>
              <th>Result</th>
              <th>Updated</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.games.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-white/30">
                  No games yet
                </td>
              </tr>
            )}
            {data?.games.map((g) => (
              <tr key={g.id} className="border-t border-white/5">
                <td className="py-2 font-mono text-cyan-300">
                  {g.featured ? "★ " : ""}
                  {g.code}
                </td>
                <td className="truncate">
                  {g.whiteName} <span className="text-white/30">vs</span> {g.blackName ?? "—"}
                </td>
                <td>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${g.status === "active" ? "bg-emerald-500/20 text-emerald-300" : g.status === "waiting" ? "bg-yellow-500/20 text-yellow-300" : "bg-white/10 text-white/50"}`}
                  >
                    {g.status}
                  </span>
                </td>
                <td>{g.moves.length}</td>
                <td className="max-w-[160px] truncate text-white/60">{g.result ?? "—"}</td>
                <td className="text-white/40">{new Date(g.updatedAt).toLocaleTimeString()}</td>
                <td className="space-x-1 whitespace-nowrap text-right">
                  <a className="btn-ghost px-2 py-1 text-xs" href={`/?room=${g.code}`} target="_blank" rel="noreferrer">
                    Watch
                  </a>
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => act({ action: "toggleFeatured", code: g.code })}>
                    {g.featured ? "Unfeature" : "Feature"}
                  </button>
                  {g.status !== "finished" && (
                    <button
                      className="btn-ghost px-2 py-1 text-xs"
                      onClick={() => act({ action: "endGame", code: g.code }, `End game ${g.code}?`)}
                    >
                      End
                    </button>
                  )}
                  <button
                    className="btn-ghost px-2 py-1 text-xs text-rose-300"
                    onClick={() => act({ action: "deleteGame", code: g.code }, `Delete game ${g.code}?`)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Global leaderboard entries</h2>
          <button
            className="btn-ghost px-2 py-1 text-xs text-rose-300"
            onClick={() => act({ action: "clearScores" }, "Delete ALL global scores?")}
          >
            Clear all
          </button>
        </div>
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase text-white/40">
            <tr>
              <th className="py-1">Name</th>
              <th>Score</th>
              <th>Mode</th>
              <th>Result</th>
              <th>When</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.scores.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-white/30">
                  No scores yet
                </td>
              </tr>
            )}
            {data?.scores.map((s) => (
              <tr key={s.id} className="border-t border-white/5">
                <td className="py-2">{s.name}</td>
                <td className="font-mono text-cyan-300">{s.score.toLocaleString()}</td>
                <td className="text-white/60">{s.mode}</td>
                <td className="max-w-[200px] truncate text-white/60">{s.result}</td>
                <td className="text-white/40">{new Date(s.createdAt).toLocaleString()}</td>
                <td className="text-right">
                  <button
                    className="btn-ghost px-2 py-1 text-xs text-rose-300"
                    onClick={() => act({ action: "deleteScore", id: s.id })}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function EnginePanel({
  engine,
  bench,
  onBench,
  onRestart,
}: {
  engine: Engine;
  bench: string | null;
  onBench: () => void;
  onRestart: () => void;
}) {
  const cmds = Object.entries(engine.stats?.commands ?? {});
  return (
    <section className="panel">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 font-bold">🐍 Python game controller</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-bold ${engine.online ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}
        >
          {engine.online ? `ONLINE · v${engine.version} · Python ${engine.python}` : "OFFLINE (browser fallback active)"}
        </span>
        <button className="btn-ghost px-3 py-1 text-xs" onClick={onBench}>
          ⚡ Benchmark
        </button>
        <button className="btn-ghost px-3 py-1 text-xs" onClick={onRestart}>
          ↻ Restart engine
        </button>
      </div>
      {bench && <div className="mb-3 rounded-lg bg-black/30 p-2 font-mono text-xs text-yellow-200">{bench}</div>}
      {engine.error && <div className="mb-3 text-xs text-rose-300">{engine.error}</div>}
      <div className="grid gap-2 sm:grid-cols-3">
        {engine.processes.map((p) => (
          <div key={p.name} className="rounded-lg bg-white/5 p-2 text-xs">
            <div className="mb-1 flex items-center gap-2 font-mono font-bold">
              <span className={`h-2 w-2 rounded-full ${p.alive ? "bg-emerald-400" : "bg-white/30"}`} />
              {p.name}
              <span className="ml-auto text-white/40">{p.pid ? `pid ${p.pid}` : "idle"}</span>
            </div>
            <div className="text-white/60">
              served {p.served} · pending {p.pending} · restarts {p.restarts} · up {p.uptimeSec}s
            </div>
          </div>
        ))}
      </div>
      {cmds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {cmds.map(([k, v]) => (
            <span key={k} className="rounded bg-white/5 px-2 py-1 font-mono text-white/60">
              {k}: {v.count}× · avg {(v.totalMs / Math.max(1, v.count)).toFixed(1)}ms
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-white/35">
        Stats shown are from the fast lane (validation, scoring). AI searches run in dedicated processes so they never
        block online move validation.
      </p>
    </section>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="panel">
      <div className={`font-mono text-3xl font-black ${accent ? "text-emerald-300" : "text-cyan-300"}`}>{value}</div>
      <div className="text-xs uppercase tracking-widest text-white/40">{label}</div>
    </div>
  );
}
