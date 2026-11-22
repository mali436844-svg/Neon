import { findBestMove, type Difficulty } from "./ai";

self.onmessage = (e: MessageEvent<{ id: number; fen: string; difficulty: Difficulty }>) => {
  const { id, fen, difficulty } = e.data;
  const m = findBestMove(fen, difficulty);
  (self as unknown as Worker).postMessage({ id, move: m ? { from: m.from, to: m.to, promotion: m.promotion } : null });
};
