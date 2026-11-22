import { json } from "@/lib/server";
import { py, EngineRuleError, type PyMove } from "@/lib/pyengine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AiResult = { move: PyMove | null; san: string | null; depth: number; nodes: number; score: number; ms?: number };

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { fen?: string; difficulty?: string; moves?: string[] };
  const difficulty = ["easy", "medium", "hard"].includes(b.difficulty ?? "") ? b.difficulty : "medium";
  const moves = Array.isArray(b.moves) ? b.moves.filter((m) => typeof m === "string").slice(0, 600) : [];
  try {
    const r = await py<AiResult>("ai", "ai", { fen: b.fen, difficulty, moves }, 6000);
    return json({ ...r, engine: "python" });
  } catch (e) {
    if (e instanceof EngineRuleError) return json({ error: e.message }, 400);
    // engine unavailable → client falls back to its in-browser worker
    return json({ error: "Python engine unavailable" }, 503);
  }
}
