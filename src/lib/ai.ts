import { Chess, type Move } from "chess.js";

export const PIECE_VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Piece-square tables from white's perspective (a8 = index 0)
const PST: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15,
    20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10,
    5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10,
    -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0,
    0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0,
    -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10,
    -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40,
    -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20,
    -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

function evaluate(chess: Chess): number {
  // Score from white's perspective
  let s = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) continue;
      const idx = p.color === "w" ? r * 8 + f : (7 - r) * 8 + f;
      const v = PIECE_VALUE[p.type] + PST[p.type][idx];
      s += p.color === "w" ? v : -v;
    }
  }
  return s;
}

function orderMoves(moves: Move[]): Move[] {
  return moves
    .map((m) => {
      let score = 0;
      if (m.captured) score += 10 * PIECE_VALUE[m.captured] - PIECE_VALUE[m.piece] / 10;
      if (m.promotion) score += PIECE_VALUE[m.promotion];
      if (m.san.includes("+")) score += 50;
      return { m, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m);
}

class Timeout extends Error {}

export type Difficulty = "easy" | "medium" | "hard";

export function findBestMove(fen: string, difficulty: Difficulty): Move | null {
  const chess = new Chess(fen);
  const rootMoves = chess.moves({ verbose: true });
  if (rootMoves.length === 0) return null;

  if (difficulty === "easy") {
    // Mostly greedy with randomness
    if (Math.random() < 0.35) return rootMoves[Math.floor(Math.random() * rootMoves.length)];
  }

  const maxDepth = difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 4;
  const timeLimit = difficulty === "hard" ? 1400 : 600;
  const start = performance.now();
  let nodes = 0;
  const color = chess.turn() === "w" ? 1 : -1;

  const quiesce = (alpha: number, beta: number, sign: number, qd: number): number => {
    const stand = sign * evaluate(chess);
    if (qd <= 0) return stand;
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    const caps = orderMoves(chess.moves({ verbose: true }).filter((m) => m.captured));
    for (const m of caps) {
      chess.move(m);
      const score = -quiesce(-beta, -alpha, -sign, qd - 1);
      chess.undo();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  };

  const negamax = (depth: number, alpha: number, beta: number, sign: number, ply: number): number => {
    if ((++nodes & 255) === 0 && performance.now() - start > timeLimit) throw new Timeout();
    if (chess.isCheckmate()) return -100000 + ply;
    if (chess.isDraw()) return 0;
    if (depth === 0) return difficulty === "hard" ? quiesce(alpha, beta, sign, 3) : sign * evaluate(chess);
    let best = -Infinity;
    for (const m of orderMoves(chess.moves({ verbose: true }))) {
      chess.move(m);
      const score = -negamax(depth - 1, -beta, -alpha, -sign, ply + 1);
      chess.undo();
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  };

  let bestMove: Move = orderMoves(rootMoves)[0];
  let ordered = orderMoves(rootMoves);
  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      let alpha = -Infinity;
      let iterBest: Move | null = null;
      const scored: { m: Move; s: number }[] = [];
      for (const m of ordered) {
        chess.move(m);
        const s = -negamax(depth - 1, -Infinity, -alpha, -color, 1);
        chess.undo();
        scored.push({ m, s });
        if (s > alpha) {
          alpha = s;
          iterBest = m;
        }
      }
      if (iterBest) bestMove = iterBest;
      ordered = scored.sort((a, b) => b.s - a.s).map((x) => x.m);
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
  }
  return bestMove;
}

export function resultText(chess: Chess): { text: string; winner: "w" | "b" | null } | null {
  if (chess.isCheckmate()) {
    const winner = chess.turn() === "w" ? "b" : "w";
    return { text: `${winner === "w" ? "White" : "Black"} wins by checkmate`, winner };
  }
  if (chess.isStalemate()) return { text: "Draw by stalemate", winner: null };
  if (chess.isInsufficientMaterial()) return { text: "Draw — insufficient material", winner: null };
  if (chess.isThreefoldRepetition()) return { text: "Draw by repetition", winner: null };
  if (chess.isDrawByFiftyMoves()) return { text: "Draw — 50-move rule", winner: null };
  if (chess.isDraw()) return { text: "Draw", winner: null };
  return null;
}
