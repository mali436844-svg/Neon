import { db } from "@/db";
import { games } from "@/db/schema";
import { json } from "@/lib/server";
import { resultText } from "@/lib/ai";
import { py, EngineRuleError, type PyMove, type PyStatus } from "@/lib/pyengine";
import { Chess } from "chess.js";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Applied = { san: string; from: string; to: string; fen: string; status: { over: boolean; text: string | null } };

/** Fallback validator if the Python controller is unavailable. */
function applyWithChessJs(moves: string[], from: string, to: string, promotion?: string): Applied {
  const c = new Chess();
  for (const m of moves) c.move(m);
  const mv = c.move({ from, to, promotion: promotion ?? "q" });
  const r = resultText(c);
  return { san: mv.san, from: mv.from, to: mv.to, fen: c.fen(), status: { over: !!r, text: r?.text ?? null } };
}

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    from?: string;
    to?: string;
    promotion?: string;
    resign?: boolean;
  };
  const [g] = await db.select().from(games).where(eq(games.code, code.toUpperCase()));
  if (!g) return json({ error: "Game not found" }, 404);
  const color = body.token && body.token === g.whiteToken ? "w" : body.token && body.token === g.blackToken ? "b" : null;
  if (!color) return json({ error: "Not a player in this game" }, 403);
  if (g.status === "finished") return json({ error: "Game is over" }, 409);

  if (body.resign) {
    await db
      .update(games)
      .set({ status: "finished", result: `${color === "w" ? "Black" : "White"} wins by resignation`, updatedAt: new Date() })
      .where(eq(games.id, g.id));
    return json({ ok: true });
  }
  if (g.status !== "active") return json({ error: "Waiting for opponent" }, 409);
  const from = String(body.from ?? "");
  const to = String(body.to ?? "");
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) return json({ error: "Illegal move" }, 400);

  let applied: Applied;
  let engine = "python";
  try {
    const r = await py<{ san: string; move: PyMove; fen: string; status: PyStatus }>(
      "fast",
      "validate",
      { moves: g.moves, from, to, promotion: body.promotion, color },
      4000,
    );
    applied = { san: r.san, from: r.move.from, to: r.move.to, fen: r.fen, status: r.status };
  } catch (e) {
    if (e instanceof EngineRuleError) return json({ error: e.message }, e.message === "Not your turn" ? 409 : 400);
    engine = "chess.js";
    const turn = new Chess(g.fen).turn();
    if (turn !== color) return json({ error: "Not your turn" }, 409);
    try {
      applied = applyWithChessJs(g.moves, from, to, body.promotion);
    } catch {
      return json({ error: "Illegal move" }, 400);
    }
  }

  const updated = await db
    .update(games)
    .set({
      fen: applied.fen,
      moves: [...g.moves, applied.san],
      lastMove: { from: applied.from, to: applied.to },
      status: applied.status.over ? "finished" : "active",
      result: applied.status.text,
      updatedAt: new Date(),
    })
    .where(and(eq(games.id, g.id), eq(games.fen, g.fen)))
    .returning({ id: games.id });
  if (updated.length === 0) return json({ error: "Conflict, retry" }, 409);
  return json({ ok: true, fen: applied.fen, san: applied.san, engine });
}
