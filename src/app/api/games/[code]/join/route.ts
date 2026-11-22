import { db } from "@/db";
import { games } from "@/db/schema";
import { cleanName, json, randomToken } from "@/lib/server";
import { and, eq, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const token = randomToken();
  const updated = await db
    .update(games)
    .set({ blackToken: token, blackName: cleanName(body.name, "Black"), status: "active", updatedAt: new Date() })
    .where(and(eq(games.code, code.toUpperCase()), isNull(games.blackToken), eq(games.status, "waiting")))
    .returning({ code: games.code });
  if (updated.length === 0) {
    const [g] = await db.select({ code: games.code }).from(games).where(eq(games.code, code.toUpperCase()));
    if (!g) return json({ error: "Game not found" }, 404);
    return json({ code: g.code, token: null, color: null, spectator: true });
  }
  return json({ code: updated[0].code, token, color: "b" });
}
