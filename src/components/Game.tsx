"use client";

import { Chess, type Move, type Square } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findBestMove, resultText, type Difficulty } from "@/lib/ai";
import { ParticleSystem } from "@/lib/particles";
import { sfx, isMuted, setMuted } from "@/lib/sound";
import { PieceSvg } from "./PieceSvg";
import GameOver from "./GameOver";
import { RULES } from "@/lib/rules";

export type GameConfig = {
  mode: "ai" | "local" | "online";
  difficulty: Difficulty;
  playerColor: "w" | "b";
  online?: { code: string; token: string | null; color: "w" | "b" | null };
};

type Color = "w" | "b";
type PieceItem = { id: number; type: string; color: Color; sq: Square };
type Float = { id: number; x: number; y: number; text: string; color: string; big?: boolean };
type OnlineInfo = { whiteName: string; blackName: string | null; status: string };
export type OverState = { text: string; winner: Color | null };

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const FILES = "abcdefgh";

let pieceIdSeq = 1;

function sqToVis(sq: string, flipped: boolean) {
  const f = sq.charCodeAt(0) - 97;
  const r = Number(sq[1]);
  return flipped ? { x: 7 - f, y: r - 1 } : { x: f, y: 8 - r };
}
function visToSq(x: number, y: number, flipped: boolean): Square {
  const f = flipped ? 7 - x : x;
  const r = flipped ? y + 1 : 8 - y;
  return (FILES[f] + r) as Square;
}

function boardPieces(chess: Chess) {
  const out: { sq: Square; type: string; color: Color }[] = [];
  for (const row of chess.board()) for (const p of row) if (p) out.push({ sq: p.square, type: p.type, color: p.color });
  return out;
}

function initPieces(chess: Chess): PieceItem[] {
  return boardPieces(chess).map((p) => ({ ...p, id: pieceIdSeq++ }));
}

function diffPieces(old: PieceItem[], chess: Chess, hint?: { from: string; to: string } | null) {
  const next = boardPieces(chess);
  const used = new Set<number>();
  const result: PieceItem[] = [];
  const unmatched: typeof next = [];
  const bySq = new Map(old.map((o) => [o.sq, o]));
  for (const n of next) {
    const o = bySq.get(n.sq);
    if (o && o.type === n.type && o.color === n.color) {
      result.push(o);
      used.add(o.id);
    } else unmatched.push(n);
  }
  for (const n of unmatched) {
    const cands = old.filter((o) => !used.has(o.id) && o.color === n.color && (o.type === n.type || o.type === "p"));
    let pick =
      cands.find((o) => hint && o.sq === hint.from && n.sq === hint.to) ??
      cands.find((o) => o.type === n.type) ??
      cands[0];
    if (pick) {
      used.add(pick.id);
      result.push({ ...pick, sq: n.sq, type: n.type });
    } else {
      pick = { ...n, id: pieceIdSeq++ };
      result.push(pick);
    }
  }
  const removed = old.filter((o) => !used.has(o.id));
  return { list: result, removed };
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

type Props = {
  config: GameConfig;
  playerName: string;
  onExit: () => void;
  onRestart: () => void;
};

export default function Game({ config, playerName, onExit, onRestart }: Props) {
  const chessRef = useRef<Chess>(new Chess());
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const [pieces, setPieces] = useState<PieceItem[]>(() => initPieces(chessRef.current));
  const piecesRef = useRef(pieces);
  useEffect(() => {
    piecesRef.current = pieces;
  }, [pieces]);
  const [ghosts, setGhosts] = useState<PieceItem[]>([]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [targets, setTargets] = useState<Move[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [cursor, setCursor] = useState<Square>(config.playerColor === "b" && config.mode === "ai" ? "e7" : "e2");
  const [kbActive, setKbActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState<OverState | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [scores, setScores] = useState({ w: 0, b: 0 });
  const [combo, setCombo] = useState({ w: 0, b: 0 });
  const [floats, setFloats] = useState<Float[]>([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMutedState] = useState(false);
  const [online, setOnline] = useState<OnlineInfo | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>("GO!");
  const [copied, setCopied] = useState(false);
  const [engineInfo, setEngineInfo] = useState<{ name: "python" | "browser"; depth?: number; nodes?: number; ms?: number } | null>(null);

  const myOnlineColor = config.online?.color ?? null;
  const [flipped, setFlipped] = useState(
    config.mode === "online" ? myOnlineColor === "b" : config.mode === "ai" && config.playerColor === "b",
  );

  const boardRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const psRef = useRef<ParticleSystem | null>(null);
  const pieceEls = useRef(new Map<number, HTMLDivElement>());
  const dragRef = useRef<{
    sq: Square;
    id: number;
    startX: number;
    startY: number;
    moved: boolean;
    wasSelected: boolean;
  } | null>(null);
  const turnStartRef = useRef(Date.now());
  const workerRef = useRef<Worker | null>(null);
  const aiReqRef = useRef(0);
  const aiT0Ref = useRef(0);
  const aiPendingRef = useRef(false);
  const pythonDownRef = useRef(0);
  const pendingAiRef = useRef<{ from: string; to: string; promotion?: string } | null>(null);
  const pausedRef = useRef(false);
  const overRef = useRef<OverState | null>(null);
  const scoresRef = useRef({ w: 0, b: 0 });
  const comboRef = useRef({ w: 0, b: 0 });
  const statsRef = useRef({ captures: 0, checks: 0, bestCombo: 0 });
  const postingRef = useRef(false);
  const floatSeq = useRef(0);

  const scoringColors: Color[] = useMemo(
    () =>
      config.mode === "ai"
        ? [config.playerColor]
        : config.mode === "local"
          ? ["w", "b"]
          : myOnlineColor
            ? [myOnlineColor]
            : [],
    [config.mode, config.playerColor, myOnlineColor],
  );

  const chess = chessRef.current;
  const turn = chess.turn();

  // ---------- setup ----------
  useEffect(() => {
    setMutedState(isMuted());
    const ps = new ParticleSystem();
    psRef.current = ps;
    if (canvasRef.current) ps.attach(canvasRef.current);
    const onResize = () => canvasRef.current && ps.resize(canvasRef.current);
    window.addEventListener("resize", onResize);
    const t = setTimeout(() => setBanner(null), 900);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(t);
      ps.destroy();
    };
  }, []);

  // Timer
  useEffect(() => {
    if (paused || over) return;
    const iv = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(iv);
  }, [paused, over]);

  // ---------- FX helpers ----------
  const sqCenter = useCallback(
    (sq: string) => {
      const b = boardRef.current;
      if (!b) return { x: 0, y: 0, size: 0 };
      const r = b.getBoundingClientRect();
      const v = sqToVis(sq, flipped);
      const size = r.width / 8;
      return { x: r.left + (v.x + 0.5) * size, y: r.top + (v.y + 0.5) * size, size };
    },
    [flipped],
  );

  const shake = (intensity: number) => {
    const el = wrapRef.current;
    if (!el || !el.animate) return;
    const frames: Keyframe[] = [];
    for (let i = 0; i < 7; i++) {
      const k = 1 - i / 7;
      frames.push({
        transform: `translate(${(Math.random() * 2 - 1) * intensity * k}px, ${(Math.random() * 2 - 1) * intensity * k}px) rotate(${(Math.random() * 2 - 1) * intensity * 0.08 * k}deg)`,
      });
    }
    frames.push({ transform: "translate(0,0)" });
    el.animate(frames, { duration: 320, easing: "ease-out" });
  };

  const addFloat = (sq: string, text: string, color: string, big = false) => {
    const v = sqToVis(sq, flipped);
    const id = ++floatSeq.current;
    setFloats((f) => [...f, { id, x: (v.x + 0.5) * 12.5, y: (v.y + 0.5) * 12.5, text, color, big }]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1100);
  };

  const showToast = (t: string) => {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 1800);
  };

  // ---------- game over ----------
  const endGame = (res: OverState) => {
    if (overRef.current) return;
    overRef.current = res;
    const moves = chessRef.current.history().length;
    const next = { ...scoresRef.current };
    for (const c of scoringColors) {
      if (res.winner === c) {
        const winBonus = RULES.winBase * (config.mode === "ai" ? (RULES.difficultyMult[config.difficulty] ?? 1) : 1);
        const speed = Math.max(0, RULES.speedBase - moves * RULES.speedPerPly);
        next[c] += winBonus + speed;
      } else if (res.winner === null) next[c] += RULES.draw;
    }
    scoresRef.current = next;
    setScores(next);
    setSelected(null);
    setTargets([]);
    setAiThinking(false);
    setTimeout(() => setOver(res), 650);
    const iWon =
      config.mode === "local" ? res.winner !== null : res.winner !== null && scoringColors.includes(res.winner);
    if (iWon) {
      sfx.win();
      setTimeout(() => psRef.current?.confetti(), 200);
      setBanner(config.mode === "local" ? "CHECKMATE!" : "VICTORY!");
    } else if (res.winner === null) {
      sfx.click();
      setBanner("DRAW");
    } else {
      sfx.lose();
      shake(14);
      setBanner(config.mode === "online" && !myOnlineColor ? "GAME OVER" : "DEFEAT");
    }
    setTimeout(() => setBanner(null), 1200);
  };

  // ---------- after move ----------
  const afterMove = (mv: Move, opts: { remote?: boolean } = {}) => {
    const c = chessRef.current;
    const hint = { from: mv.from, to: mv.to };
    const { list, removed } = diffPieces(piecesRef.current, c, hint);
    piecesRef.current = list;
    setPieces(list);
    if (removed.length) {
      const removedIds = new Set(removed.map((r) => r.id));
      setGhosts((g) => [...g.filter((x) => !removedIds.has(x.id)), ...removed]);
      setTimeout(() => setGhosts((g) => g.filter((x) => !removedIds.has(x.id))), 380);
    }
    setLastMove(hint);
    bump();

    const ps = psRef.current;
    const center = sqCenter(mv.to);
    const isCheck = mv.san.includes("+") || mv.san.includes("#");
    const mover = mv.color as Color;
    const scoring = scoringColors.includes(mover) && !opts.remote;

    // Scoring
    let pts = 0;
    if (scoring || (opts.remote && scoringColors.includes(mover))) {
      const cmb = { ...comboRef.current };
      if (mv.captured) {
        cmb[mover] += 1;
        const mult = Math.min(cmb[mover], RULES.comboCap);
        const gain = (RULES.piece[mv.captured] ?? 0) * RULES.captureUnit * mult;
        pts += gain;
        addFloat(mv.to, mult > 1 ? `+${gain} x${mult}!` : `+${gain}`, mult > 1 ? "#facc15" : "#22d3ee", mult > 1);
        statsRef.current.captures++;
        statsRef.current.bestCombo = Math.max(statsRef.current.bestCombo, cmb[mover]);
      } else cmb[mover] = 0;
      if (isCheck) {
        pts += RULES.check;
        statsRef.current.checks++;
        setTimeout(() => addFloat(mv.to, `CHECK +${RULES.check}`, "#f472b6"), 120);
      }
      if (mv.promotion) {
        pts += RULES.promotion;
        setTimeout(() => addFloat(mv.to, `PROMOTED +${RULES.promotion}`, "#facc15", true), 200);
      }
      const dt = Date.now() - turnStartRef.current;
      if (dt < RULES.quickMs && c.history().length > 1 && config.mode !== "online") {
        pts += RULES.quick;
        if (!mv.captured) addFloat(mv.to, `QUICK +${RULES.quick}`, "#34d399");
      }
      comboRef.current = cmb;
      setCombo(cmb);
      if (pts) {
        scoresRef.current = { ...scoresRef.current, [mover]: scoresRef.current[mover] + pts };
        setScores(scoresRef.current);
      }
    }
    turnStartRef.current = Date.now();

    // FX
    if (ps) {
      if (mv.captured) {
        const v = VAL[mv.captured];
        const palette =
          mover === "w" ? ["#a78bfa", "#f472b6", "#3b2a6b", "#ffffff"] : ["#ffffff", "#22d3ee", "#ddd6fe", "#a78bfa"];
        ps.burst(center.x, center.y, palette, 18 + v * 6, 0.8 + v * 0.06);
        shake(4 + v * 1.6);
        sfx.capture(comboRef.current[mover]);
      } else {
        ps.sparkle(center.x, center.y, "#a5f3fc", 6);
        sfx.move();
      }
      if (isCheck) {
        const kingSq = boardPieces(c).find((p) => p.type === "k" && p.color === c.turn())?.sq;
        if (kingSq) {
          const kc = sqCenter(kingSq);
          ps.ring(kc.x, kc.y, "#f43f5e", kc.size * 0.3);
          ps.sparkle(kc.x, kc.y, "#fb7185", 12);
        }
        shake(6);
        setTimeout(() => sfx.check(), 60);
      }
      if (mv.promotion) {
        ps.burst(center.x, center.y, ["#facc15", "#fde68a", "#ffffff"], 40, 1.2);
        sfx.promote();
      }
    }

    const res = resultText(c);
    if (res) endGame(res);
  };

  // ---------- AI ----------
  const applyAi = (m: { from: string; to: string; promotion?: string }) => {
    setAiThinking(false);
    aiPendingRef.current = false;
    if (overRef.current) return;
    let mv: Move;
    try {
      mv = chessRef.current.move(m);
    } catch {
      return;
    }
    afterMove(mv);
  };

  const handleAiResult = (id: number, m: { from: string; to: string; promotion?: string } | null) => {
    if (id !== aiReqRef.current || !m) return;
    const wait = Math.max(0, 420 - (performance.now() - aiT0Ref.current));
    setTimeout(() => {
      if (id !== aiReqRef.current) return;
      if (pausedRef.current) {
        pendingAiRef.current = m;
        return;
      }
      applyAi(m);
    }, wait);
  };
  const handleAiRef = useRef(handleAiResult);
  handleAiRef.current = handleAiResult;

  useEffect(() => {
    if (config.mode !== "ai") return;
    try {
      const w = new Worker(new URL("../lib/ai.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<{ id: number; move: { from: string; to: string; promotion?: string } | null }>) =>
        handleAiRef.current(e.data.id, e.data.move);
      w.onerror = () => {
        workerRef.current = null;
        if (!aiPendingRef.current) return;
        const id = aiReqRef.current;
        const fen = chessRef.current.fen();
        setTimeout(() => {
          const m = findBestMove(fen, config.difficulty);
          handleAiRef.current(id, m ? { from: m.from, to: m.to, promotion: m.promotion } : null);
        }, 30);
      };
      workerRef.current = w;
    } catch {
      workerRef.current = null;
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [config.mode, config.difficulty]);

  const requestAi = () => {
    if (overRef.current) return;
    setAiThinking(true);
    aiPendingRef.current = true;
    const id = ++aiReqRef.current;
    aiT0Ref.current = performance.now();
    const fen = chessRef.current.fen();
    const moves = chessRef.current.history();
    const local = () => {
      if (id !== aiReqRef.current) return;
      setEngineInfo({ name: "browser" });
      if (workerRef.current) {
        workerRef.current.postMessage({ id, fen, difficulty: config.difficulty });
      } else {
        setTimeout(() => {
          const m = findBestMove(fen, config.difficulty);
          handleAiRef.current(id, m ? { from: m.from, to: m.to, promotion: m.promotion } : null);
        }, 30);
      }
    };
    // Primary: server-side Python controller (saves client CPU/battery). Fallback: in-browser worker.
    if (pythonDownRef.current > Date.now()) return local();
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 7000);
    fetch("/api/engine/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen, moves, difficulty: config.difficulty }),
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as {
          move: { from: string; to: string; promotion: string | null } | null;
          depth: number;
          nodes: number;
          ms?: number;
        };
        if (!d.move) throw new Error("no move");
        setEngineInfo({ name: "python", depth: d.depth, nodes: d.nodes, ms: d.ms });
        handleAiRef.current(id, { from: d.move.from, to: d.move.to, promotion: d.move.promotion ?? undefined });
      })
      .catch(() => {
        pythonDownRef.current = Date.now() + 30000; // retry Python after 30s
        local();
      })
      .finally(() => clearTimeout(to));
  };

  // AI opens if player is black
  useEffect(() => {
    if (config.mode === "ai" && config.playerColor === "b") {
      const t = setTimeout(() => requestAi(), 700);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Online ----------
  const syncOnline = (d: {
    moves: string[];
    status: string;
    result: string | null;
    whiteName: string;
    blackName: string | null;
  }) => {
    setOnline((prev) => {
      if (prev && prev.status === "waiting" && d.status === "active") {
        sfx.promote();
        showToast(`${myOnlineColor === "w" ? d.blackName : d.whiteName} joined!`);
        setBanner("GO!");
        setTimeout(() => setBanner(null), 900);
        turnStartRef.current = Date.now();
      }
      return { whiteName: d.whiteName, blackName: d.blackName, status: d.status };
    });
    if (postingRef.current) return;
    const local = chessRef.current.history();
    const differs = d.moves.length !== local.length || d.moves.some((m, i) => m !== local[i]);
    if (differs) {
      const c = new Chess();
      try {
        for (const m of d.moves) c.move(m);
      } catch {
        return;
      }
      const isNext = d.moves.length === local.length + 1 && local.every((m, i) => m === d.moves[i]);
      chessRef.current = c;
      setSelected(null);
      setTargets([]);
      const last = c.history({ verbose: true }).at(-1);
      if (isNext && last) {
        afterMove(last, { remote: true });
      } else {
        setPieces((p) => diffPieces(p, c, last ? { from: last.from, to: last.to } : null).list);
        setLastMove(last ? { from: last.from, to: last.to } : null);
        bump();
      }
    }
    if (d.status === "finished" && !overRef.current) {
      const r = d.result ?? "Game over";
      endGame({ text: r, winner: r.startsWith("White wins") ? "w" : r.startsWith("Black wins") ? "b" : null });
    }
  };
  const syncRef = useRef(syncOnline);
  syncRef.current = syncOnline;

  const pollNow = useCallback(async () => {
    if (!config.online) return;
    try {
      const r = await fetch(`/api/games/${config.online.code}`, { cache: "no-store" });
      if (r.ok) syncRef.current(await r.json());
    } catch {
      /* offline */
    }
  }, [config.online]);

  useEffect(() => {
    if (config.mode !== "online") return;
    void pollNow();
    const iv = setInterval(() => void pollNow(), 1000);
    return () => clearInterval(iv);
  }, [config.mode, pollNow]);

  const postOnline = async (body: Record<string, unknown>) => {
    if (!config.online?.token) return;
    postingRef.current = true;
    try {
      const r = await fetch(`/api/games/${config.online.code}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: config.online.token, ...body }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        showToast(e.error ?? "Move rejected");
        postingRef.current = false;
        chessRef.current = new Chess();
        setPieces([]);
        await pollNow();
        return;
      }
    } catch {
      showToast("Network error");
    }
    postingRef.current = false;
  };

  // ---------- input logic ----------
  const isHumanColor = (c: Color) => {
    if (config.mode === "local") return true;
    if (config.mode === "ai") return c === config.playerColor;
    return c === myOnlineColor;
  };

  const canAct = () => {
    if (overRef.current || pausedRef.current || promo) return false;
    const c = chessRef.current;
    if (!isHumanColor(c.turn())) return false;
    if (config.mode === "ai" && aiThinking) return false;
    if (config.mode === "online" && online?.status !== "active") return false;
    return true;
  };

  const select = (sq: Square | null) => {
    if (!sq) {
      setSelected(null);
      setTargets([]);
      return;
    }
    const ms = chessRef.current.moves({ square: sq, verbose: true });
    setSelected(sq);
    setTargets(ms);
    if (ms.length) sfx.select();
    else {
      sfx.illegal();
      shake(2);
    }
  };

  const doMove = (from: Square, to: Square, promotion?: string) => {
    let mv: Move;
    try {
      mv = chessRef.current.move({ from, to, promotion });
    } catch {
      sfx.illegal();
      return;
    }
    setSelected(null);
    setTargets([]);
    setPromo(null);
    afterMove(mv);
    if (config.mode === "online") void postOnline({ from, to, promotion });
    if (config.mode === "ai" && !overRef.current) requestAi();
  };

  const tryMove = (from: Square, to: Square) => {
    const ms = chessRef.current.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!ms.length) {
      sfx.illegal();
      shake(3);
      return false;
    }
    if (ms[0].promotion) {
      setPromo({ from, to });
      sfx.select();
      return true;
    }
    doMove(from, to);
    return true;
  };

  const handleSquare = (sq: Square) => {
    if (!canAct()) {
      if (!overRef.current && !pausedRef.current) sfx.illegal();
      return;
    }
    const c = chessRef.current;
    const piece = c.get(sq);
    if (selected && targets.some((t) => t.to === sq)) {
      tryMove(selected, sq);
      return;
    }
    if (piece && piece.color === c.turn()) {
      if (selected === sq) select(null);
      else select(sq);
      return;
    }
    if (selected && piece) {
      sfx.illegal();
      shake(3);
    }
    select(null);
  };

  const sqFromPoint = (clientX: number, clientY: number): Square | null => {
    const b = boardRef.current;
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const x = Math.floor(((clientX - r.left) / r.width) * 8);
    const y = Math.floor(((clientY - r.top) / r.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return visToSq(x, y, flipped);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    sfx.unlock();
    setKbActive(false);
    const sq = sqFromPoint(e.clientX, e.clientY);
    if (!sq) return;
    if (!canAct()) {
      handleSquare(sq);
      return;
    }
    const c = chessRef.current;
    const piece = c.get(sq);
    if (selected && targets.some((t) => t.to === sq)) {
      tryMove(selected, sq);
      return;
    }
    if (piece && piece.color === c.turn()) {
      const item = pieces.find((p) => p.sq === sq);
      const wasSelected = selected === sq;
      if (!wasSelected) select(sq);
      if (item) {
        dragRef.current = { sq, id: item.id, startX: e.clientX, startY: e.clientY, moved: false, wasSelected };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
      return;
    }
    handleSquare(sq);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const el = pieceEls.current.get(d.id);
    const b = boardRef.current;
    if (!el || !b) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
      d.moved = true;
      el.classList.add("dragging");
    }
    const r = b.getBoundingClientRect();
    const s = r.width / 8;
    el.style.transform = `translate(${e.clientX - r.left - s / 2}px, ${e.clientY - r.top - s * 0.7}px) scale(1.18)`;
  };

  const endDrag = (e: React.PointerEvent, cancel = false) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const el = pieceEls.current.get(d.id);
    if (d.moved) {
      if (el) {
        el.classList.remove("dragging");
        el.style.transform = "";
      }
      if (cancel) return;
      const sq = sqFromPoint(e.clientX, e.clientY);
      if (sq && sq !== d.sq) {
        if (!tryMove(d.sq, sq)) select(null);
      }
    } else if (d.wasSelected) {
      select(null);
    }
  };

  // ---------- actions ----------
  const togglePause = () => {
    if (overRef.current) return;
    const p = !pausedRef.current;
    pausedRef.current = p;
    setPaused(p);
    sfx.click();
    if (!p) {
      turnStartRef.current = Date.now();
      if (pendingAiRef.current) {
        const m = pendingAiRef.current;
        pendingAiRef.current = null;
        setTimeout(() => applyAi(m), 150);
      }
    }
  };

  const undo = () => {
    if (overRef.current || pausedRef.current || config.mode === "online") return;
    const c = chessRef.current;
    if (c.history().length === 0) return;
    if (config.mode === "ai") {
      aiReqRef.current++;
      aiPendingRef.current = false;
      pendingAiRef.current = null;
      setAiThinking(false);
      c.undo();
      if (c.turn() !== config.playerColor) c.undo();
      if (c.turn() !== config.playerColor) {
        requestAi();
      }
      const pc = config.playerColor;
      scoresRef.current = { ...scoresRef.current, [pc]: Math.max(0, scoresRef.current[pc] - RULES.undoPenalty) };
      setScores(scoresRef.current);
      showToast(`Undo −${RULES.undoPenalty}`);
    } else {
      c.undo();
      showToast("Undo");
    }
    comboRef.current = { w: 0, b: 0 };
    setCombo(comboRef.current);
    setPromo(null);
    select(null);
    const h = c.history({ verbose: true }).at(-1);
    setLastMove(h ? { from: h.from, to: h.to } : null);
    setPieces((p) => diffPieces(p, c).list);
    sfx.move();
    bump();
  };

  const resign = () => {
    if (overRef.current) return;
    if (!window.confirm("Resign this game?")) return;
    if (config.mode === "online") {
      void postOnline({ resign: true }).then(() => pollNow());
      return;
    }
    const loser = config.mode === "ai" ? config.playerColor : chessRef.current.turn();
    const winner: Color = loser === "w" ? "b" : "w";
    endGame({ text: `${winner === "w" ? "White" : "Black"} wins by resignation`, winner });
  };

  const toggleMute = () => {
    const m = !isMuted();
    setMuted(m);
    setMutedState(m);
  };

  const copyLink = async () => {
    if (!config.online) return;
    const url = `${window.location.origin}/?room=${config.online.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Share this link", url);
    }
  };

  // ---------- keyboard ----------
  const keyHandler = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const k = e.key;
    if (overRef.current) {
      if (k === "r" || k === "R") {
        if (config.mode !== "online") onRestart();
      }
      return;
    }
    if (promo) {
      const map: Record<string, string> = { "1": "q", "2": "r", "3": "b", "4": "n", q: "q", r: "r", b: "b", n: "n" };
      const p = map[k.toLowerCase()];
      if (p) doMove(promo.from, promo.to, p);
      if (k === "Escape") setPromo(null);
      return;
    }
    if (k === "Escape" || k === "p" || k === "P") {
      e.preventDefault();
      if (k === "Escape" && selected && !pausedRef.current) select(null);
      else togglePause();
      return;
    }
    if (pausedRef.current) {
      if (k === "r" || k === "R") {
        if (config.mode !== "online") onRestart();
      }
      return;
    }
    if (k === "m" || k === "M") return toggleMute();
    if (k === "u" || k === "U") return undo();
    if (k === "f" || k === "F") return setFlipped((f) => !f);
    const dirs: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      w: [0, -1],
      s: [0, 1],
      a: [-1, 0],
      d: [1, 0],
    };
    if (dirs[k]) {
      e.preventDefault();
      if (!kbActive) {
        setKbActive(true);
        return;
      }
      const v = sqToVis(cursor, flipped);
      const nx = Math.max(0, Math.min(7, v.x + dirs[k][0]));
      const ny = Math.max(0, Math.min(7, v.y + dirs[k][1]));
      setCursor(visToSq(nx, ny, flipped));
      return;
    }
    if (k === "Enter" || k === " ") {
      e.preventDefault();
      sfx.unlock();
      setKbActive(true);
      handleSquare(cursor);
    }
  };
  const keyRef = useRef(keyHandler);
  keyRef.current = keyHandler;
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ---------- derived ----------
  const targetSet = new Map(targets.map((t) => [t.to, !!t.captured || t.flags.includes("e")]));
  const checkSq = chess.inCheck() ? boardPieces(chess).find((p) => p.type === "k" && p.color === turn)?.sq : null;
  const history = chess.history();
  const captured = useMemo(() => {
    const start: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const cur = { w: { ...start } as Record<string, number>, b: { ...start } as Record<string, number> };
    const counts = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 } as Record<string, number>, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } as Record<string, number> };
    for (const p of pieces) if (p.type !== "k") counts[p.color][p.type]++;
    const lost = { w: [] as string[], b: [] as string[] };
    let mat = 0;
    for (const c of ["w", "b"] as Color[]) {
      for (const t of ["q", "r", "b", "n", "p"]) {
        const n = Math.max(0, cur[c][t] - counts[c][t]);
        for (let i = 0; i < n; i++) lost[c].push(t);
        mat += (c === "w" ? 1 : -1) * counts[c][t] * VAL[t];
      }
    }
    return { lost, mat };
  }, [pieces]);

  const names: Record<Color, string> =
    config.mode === "ai"
      ? config.playerColor === "w"
        ? { w: playerName || "You", b: `CPU · ${config.difficulty}` }
        : { w: `CPU · ${config.difficulty}`, b: playerName || "You" }
      : config.mode === "local"
        ? { w: "White", b: "Black" }
        : { w: online?.whiteName ?? "White", b: online?.blackName ?? "Waiting…" };

  const topColor: Color = flipped ? "w" : "b";
  const bottomColor: Color = flipped ? "b" : "w";

  const finalScore = (() => {
    if (config.mode === "local") {
      const w = over?.winner;
      return w ? scores[w] : Math.max(scores.w, scores.b);
    }
    const c = config.mode === "ai" ? config.playerColor : myOnlineColor;
    return c ? scores[c] : 0;
  })();

  const renderBar = (color: Color) => {
    const active = turn === color && !over;
    const thinking = config.mode === "ai" && color !== config.playerColor && aiThinking;
    const showScore = scoringColors.includes(color);
    const diff = color === "w" ? captured.mat : -captured.mat;
    return (
      <div className={`player-bar ${active ? "active" : ""}`}>
        <div className={`dot ${color}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 truncate text-sm font-semibold">
            <span className="truncate">{names[color]}</span>
            {config.mode === "ai" && color !== config.playerColor && engineInfo && (
              <span
                className={`engine-badge ${engineInfo.name}`}
                title={engineInfo.name === "python" ? `${engineInfo.nodes ?? 0} nodes in ${engineInfo.ms ?? 0}ms` : "In-browser fallback"}
              >
                {engineInfo.name === "python" ? `🐍 Python${engineInfo.depth ? ` · d${engineInfo.depth}` : ""}` : "⚡ Browser"}
              </span>
            )}
            {thinking && (
              <span className="thinking">
                <i />
                <i />
                <i />
              </span>
            )}
            {online && config.mode === "online" && color === myOnlineColor && (
              <span className="rounded bg-cyan-400/20 px-1.5 text-[10px] text-cyan-300">YOU</span>
            )}
          </div>
          <div className="captured">
            {captured.lost[color === "w" ? "b" : "w"].map((t, i) => (
              <span key={i} className="cap">
                <PieceSvg type={t} color={color === "w" ? "b" : "w"} />
              </span>
            ))}
            {diff > 0 && <span className="ml-1 text-xs text-white/60">+{diff}</span>}
          </div>
        </div>
        {showScore && (
          <div className="text-right">
            <div key={scores[color]} className="score-pop font-mono text-lg font-bold text-cyan-300">
              {scores[color].toLocaleString()}
            </div>
            {combo[color] > 1 && <div className="combo">COMBO x{Math.min(combo[color], 5)}</div>}
          </div>
        )}
      </div>
    );
  };

  const modeLabel =
    config.mode === "ai" ? `vs CPU (${config.difficulty})` : config.mode === "local" ? "2 Players" : `Room ${config.online?.code}`;

  return (
    <div className="game-root">
      <canvas ref={canvasRef} className="fx-canvas" />

      <header className="hud">
        <button className="icon-btn" onClick={onExit} aria-label="Back to menu">
          ←
        </button>
        <div className="min-w-0 flex-1">
          <div className="logo-sm">NEON GAMBIT</div>
          <div className="truncate text-xs text-white/50">{modeLabel}</div>
        </div>
        <div className="font-mono text-sm text-white/70 tabular-nums">{fmtTime(elapsed)}</div>
        <button className="icon-btn" onClick={toggleMute} aria-label="Toggle sound">
          {muted ? "🔇" : "🔊"}
        </button>
        <button className="icon-btn" onClick={togglePause} aria-label="Pause">
          ❚❚
        </button>
      </header>

      <main className="game-main">
        <section className="board-col">
          {renderBar(topColor)}
          <div ref={wrapRef} className="board-wrap">
            <div
              ref={boardRef}
              className={`board ${paused ? "blur-board" : ""}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => endDrag(e)}
              onPointerCancel={(e) => endDrag(e, true)}
              onContextMenu={(e) => e.preventDefault()}
            >
              {Array.from({ length: 64 }, (_, i) => {
                const x = i % 8;
                const y = Math.floor(i / 8);
                const sq = visToSq(x, y, flipped);
                const light = (x + y) % 2 === 0;
                const isTarget = targetSet.has(sq);
                const cls = [
                  "sq",
                  light ? "light" : "dark",
                  lastMove && (lastMove.from === sq || lastMove.to === sq) ? "last" : "",
                  selected === sq ? "selected" : "",
                  checkSq === sq ? "in-check" : "",
                  kbActive && cursor === sq ? "cursor" : "",
                ].join(" ");
                return (
                  <div key={i} className={cls}>
                    {isTarget && <span className={targetSet.get(sq) ? "cap-ring" : "move-dot"} />}
                    {x === 0 && <span className="coord rank">{sq[1]}</span>}
                    {y === 7 && <span className="coord file">{sq[0]}</span>}
                  </div>
                );
              })}
              {ghosts.map((p, i) => {
                const v = sqToVis(p.sq, flipped);
                return (
                  <div
                    key={`g-${p.id}-${i}`}
                    className="piece ghost"
                    style={{ "--x": v.x, "--y": v.y } as React.CSSProperties}
                  >
                    <PieceSvg type={p.type} color={p.color} />
                  </div>
                );
              })}
              {pieces.map((p, i) => {
                const v = sqToVis(p.sq, flipped);
                return (
                  <div
                    key={p.id}
                    ref={(el) => {
                      if (el) pieceEls.current.set(p.id, el);
                      else pieceEls.current.delete(p.id);
                    }}
                    className={`piece ${selected === p.sq ? "lifted" : ""}`}
                    style={{ "--x": v.x, "--y": v.y, "--d": `${i * 14}ms` } as React.CSSProperties}
                  >
                    <PieceSvg type={p.type} color={p.color} />
                  </div>
                );
              })}
              {floats.map((f) => (
                <div
                  key={f.id}
                  className={`float-text ${f.big ? "big" : ""}`}
                  style={{ left: `${f.x}%`, top: `${f.y}%`, color: f.color }}
                >
                  {f.text}
                </div>
              ))}

              {promo && (
                <div className="promo-overlay" onPointerDown={(e) => e.stopPropagation()}>
                  <div className="promo-box">
                    <div className="mb-2 text-center text-sm text-white/70">Promote to</div>
                    <div className="flex gap-2">
                      {["q", "r", "b", "n"].map((t, i) => (
                        <button key={t} className="promo-btn" onClick={() => doMove(promo.from, promo.to, t)}>
                          <PieceSvg type={t} color={turn} />
                          <span className="kbd-hint">{i + 1}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {config.mode === "online" && online?.status === "waiting" && (
                <div className="overlay-soft" onPointerDown={(e) => e.stopPropagation()}>
                  <div className="panel text-center">
                    <div className="text-xs uppercase tracking-widest text-white/50">Room code</div>
                    <div className="my-2 font-mono text-4xl font-black tracking-[0.3em] text-cyan-300">
                      {config.online?.code}
                    </div>
                    <div className="mb-4 text-sm text-white/60">Waiting for an opponent to join…</div>
                    <button className="btn-primary" onClick={copyLink}>
                      {copied ? "Copied!" : "Copy invite link"}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {banner && <div className="banner">{banner}</div>}
            {toast && <div className="toast">{toast}</div>}
          </div>
          {renderBar(bottomColor)}

          <div className="action-row">
            {config.mode !== "online" && (
              <button className="btn-ghost" onClick={undo} disabled={history.length === 0 || !!over}>
                ↶ Undo
              </button>
            )}
            <button className="btn-ghost" onClick={() => setFlipped((f) => !f)}>
              ⇅ Flip
            </button>
            {(config.mode !== "online" || myOnlineColor) && (
              <button className="btn-ghost" onClick={resign} disabled={!!over}>
                ⚑ Resign
              </button>
            )}
          </div>
        </section>

        <aside className="side-col">
          <div className="panel">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/50">Moves</h3>
              <span className="text-xs text-white/40">{history.length} plies</span>
            </div>
            <MoveList history={history} />
          </div>
          <div className="panel text-xs text-white/60">
            <h3 className="mb-2 font-bold uppercase tracking-widest text-white/50">Controls</h3>
            <ul className="space-y-1">
              <li>
                <kbd>Click</kbd>/<kbd>Tap</kbd> or <kbd>Drag</kbd> pieces
              </li>
              <li>
                <kbd>←↑↓→</kbd>/<kbd>WASD</kbd> cursor · <kbd>Enter</kbd> select
              </li>
              <li>
                <kbd>P</kbd>/<kbd>Esc</kbd> pause · <kbd>U</kbd> undo · <kbd>F</kbd> flip
              </li>
              <li>
                <kbd>M</kbd> mute · <kbd>R</kbd> restart (paused/over)
              </li>
            </ul>
            <h3 className="mb-1 mt-3 font-bold uppercase tracking-widest text-white/50">Scoring</h3>
            <ul className="space-y-0.5">
              <li>Capture: value × 100 × combo (max x5)</li>
              <li>Check +50 · Promotion +500 · Quick move +25</li>
              <li>Win bonus × difficulty + speed bonus</li>
            </ul>
          </div>
        </aside>
      </main>

      {paused && !over && (
        <div className="overlay">
          <div className="panel pop-in w-[min(90vw,360px)] text-center">
            <div className="title-md mb-1">PAUSED</div>
            <div className="mb-5 text-sm text-white/50">
              {config.mode === "online" ? "Online games keep running" : "Take a breath."}
            </div>
            <div className="flex flex-col gap-2">
              <button className="btn-primary" onClick={togglePause}>
                ▶ Resume <span className="opacity-60">(P)</span>
              </button>
              {config.mode !== "online" && (
                <button className="btn-ghost" onClick={onRestart}>
                  ↻ Restart <span className="opacity-60">(R)</span>
                </button>
              )}
              <button className="btn-ghost" onClick={onExit}>
                ⌂ Main menu
              </button>
            </div>
          </div>
        </div>
      )}

      {over && (
        <GameOver
          over={over}
          mode={config.mode}
          difficulty={config.difficulty}
          score={finalScore}
          moves={history.length}
          elapsed={elapsed}
          stats={statsRef.current}
          history={history}
          playerColor={config.mode === "ai" ? config.playerColor : (myOnlineColor ?? undefined)}
          won={
            config.mode === "local"
              ? over.winner !== null
              : over.winner !== null && scoringColors.includes(over.winner)
          }
          playerName={playerName}
          onRestart={onRestart}
          onExit={onExit}
        />
      )}
    </div>
  );
}

function MoveList({ history }: { history: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [history.length]);
  const rows: [string, string | undefined][] = [];
  for (let i = 0; i < history.length; i += 2) rows.push([history[i], history[i + 1]]);
  return (
    <div ref={ref} className="move-list">
      {rows.length === 0 && <div className="py-4 text-center text-xs text-white/30">Make your first move!</div>}
      {rows.map((r, i) => (
        <div key={i} className="move-row">
          <span className="text-white/30">{i + 1}.</span>
          <span>{r[0]}</span>
          <span>{r[1] ?? ""}</span>
        </div>
      ))}
    </div>
  );
}
