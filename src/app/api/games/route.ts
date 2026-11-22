import { db, isDatabaseConfigured } from "@/db";
import { games } from "@/db/schema";
import { cleanName, json, randomCode, randomToken, START_FEN } from "@/lib/server";
import { desc, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return json({ games: [] });
  }
  try {
    const rows = await db
      .select({
        code: games.code,
        whiteName: games.whiteName,
        blackName: games.blackName,
        status: games.status,
        featured: games.featured,
        updatedAt: games.updatedAt,
      })
      .from(games)
      .where(inArray(games.status, ["waiting", "active"]))
      .orderBy(desc(games.featured), desc(games.updatedAt))
      .limit(20);
    return json({ games: rows });
  } catch (err) {
    console.warn("Games list unavailable:", err);
    return json({ games: [] });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const token = randomToken();
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    try {
      await db.insert(games).values({
        code,
        fen: START_FEN,
        moves: [],
        whiteToken: token,
        whiteName: cleanName(body.name, "White"),
        status: "waiting",
      });
      return json({ code, token, color: "w" });
    } catch {
      // code collision, retry
    }
  }
  return json({ error: "Could not create game" }, 500);
}
