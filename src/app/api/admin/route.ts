import { db, isDatabaseConfigured } from "@/db";
import { games, scores } from "@/db/schema";
import { cleanName, isAdmin, json, randomCode, randomToken, START_FEN } from "@/lib/server";
import { count, desc, eq, lt, and, ne } from "drizzle-orm";
import { py, pyPool } from "@/lib/pyengine";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdmin(req)) return json({ error: "Unauthorized" }, 401);
  let g: (typeof games.$inferSelect)[] = [];
  let s: (typeof scores.$inferSelect)[] = [];
  let totalGames = 0;
  let totalScores = 0;

  if (isDatabaseConfigured()) {
    try {
      const [gamesRes, scoresRes, [gcRes], [scRes]] = await Promise.all([
        db.select().from(games).orderBy(desc(games.updatedAt)).limit(100),
        db.select().from(scores).orderBy(desc(scores.createdAt)).limit(100),
        db.select({ n: count() }).from(games),
        db.select({ n: count() }).from(scores),
      ]);
      g = gamesRes;
      s = scoresRes;
      totalGames = Number(gcRes?.n ?? 0);
      totalScores = Number(scRes?.n ?? 0);
    } catch (err) {
      console.warn("Database query error in admin console:", err);
    }
  }

  let engine: unknown = null;
  try {
    const [ping, stats] = await Promise.all([
      py<Record<string, unknown>>("fast", "ping", {}, 3000),
      py<Record<string, unknown>>("fast", "stats", {}, 3000),
    ]);
    engine = { online: true, ...ping, stats, processes: pyPool.info() };
  } catch (e) {
    engine = { online: false, error: e instanceof Error ? e.message : "down", processes: pyPool.info() };
  }
  return json({
    engine,
    games: g.map((x) => ({ ...x, whiteToken: undefined, blackToken: undefined, hasBlack: !!x.blackToken })),
    scores: s,
    stats: {
      totalGames,
      totalScores,
      active: g.filter((x) => x.status === "active").length,
      waiting: g.filter((x) => x.status === "waiting").length,
    },
  });
}

export async function POST(req: Request) {
  if (!isAdmin(req)) return json({ error: "Unauthorized" }, 401);
  const b = (await req.json().catch(() => ({}))) as { action?: string; code?: string; id?: number; name?: string };
  switch (b.action) {
    case "deleteGame":
      await db.delete(games).where(eq(games.code, String(b.code)));
      return json({ ok: true });
    case "endGame":
      await db
        .update(games)
        .set({ status: "finished", result: "Ended by admin", updatedAt: new Date() })
        .where(eq(games.code, String(b.code)));
      return json({ ok: true });
    case "toggleFeatured": {
      const [g] = await db.select().from(games).where(eq(games.code, String(b.code)));
      if (!g) return json({ error: "Not found" }, 404);
      await db.update(games).set({ featured: g.featured ? 0 : 1 }).where(eq(games.id, g.id));
      return json({ ok: true });
    }
    case "createFeatured": {
      // Admin-hosted open room: anyone can claim white, then black.
      const code = randomCode();
      const token = randomToken();
      await db.insert(games).values({
        code,
        fen: START_FEN,
        moves: [],
        whiteToken: token,
        whiteName: cleanName(b.name, "Admin"),
        status: "waiting",
        featured: 1,
      });
      return json({ ok: true, code, token });
    }
    case "deleteScore":
      await db.delete(scores).where(eq(scores.id, Number(b.id)));
      return json({ ok: true });
    case "clearScores":
      await db.delete(scores);
      return json({ ok: true });
    case "cleanup": {
      const cutoff = new Date(Date.now() - 1000 * 60 * 60 * 6);
      await db.delete(games).where(and(lt(games.updatedAt, cutoff), ne(games.featured, 1)));
      await db.delete(games).where(eq(games.status, "finished"));
      return json({ ok: true });
    }
    case "engineRestart":
      pyPool.restart();
      return json({ ok: true });
    case "engineBench":
      try {
        const [bench, ai] = await Promise.all([
          py<{ nodes: number; ms: number; nps: number }>("fast", "bench", {}, 10000),
          py<{ san: string; depth: number; nodes: number; ms: number }>("ai", "ai", { difficulty: "hard", moves: ["e4", "e5", "Nf3", "Nc6"] }, 10000),
        ]);
        return json({ ok: true, bench, ai });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "Engine unavailable" }, 503);
      }
    default:
      return json({ error: "Unknown action" }, 400);
  }
}
