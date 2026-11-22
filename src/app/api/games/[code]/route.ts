import { db } from "@/db";
import { games } from "@/db/schema";
import { json } from "@/lib/server";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [g] = await db.select().from(games).where(eq(games.code, code.toUpperCase()));
  if (!g) return json({ error: "Game not found" }, 404);
  return json({
    code: g.code,
    fen: g.fen,
    moves: g.moves,
    lastMove: g.lastMove,
    whiteName: g.whiteName,
    blackName: g.blackName,
    status: g.status,
    result: g.result,
    updatedAt: g.updatedAt,
  });
}
