import { db, isDatabaseConfigured } from "@/db";
import { scores } from "@/db/schema";
import { cleanName, json } from "@/lib/server";
import { py } from "@/lib/pyengine";
import { desc } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return json({ scores: [] });
  }
  try {
    const rows = await db.select().from(scores).orderBy(desc(scores.score)).limit(15);
    return json({ scores: rows });
  } catch (err) {
    console.warn("Scores unavailable:", err);
    return json({ scores: [] });
  }
}

type Verify = { verified: number; max: number; adjusted: boolean };

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as {
    name?: string;
    score?: number;
    mode?: string;
    label?: string;
    difficulty?: string;
    playerColor?: string;
    result?: string;
    history?: string[];
  };
  const claimed = Math.floor(Number(b.score));
  if (!Number.isFinite(claimed) || claimed < 0 || claimed > 1_000_000) return json({ error: "Bad score" }, 400);
  const history = Array.isArray(b.history) ? b.history.filter((m) => typeof m === "string").slice(0, 800) : [];

  // The Python controller replays the game and caps the score at the maximum legally achievable.
  let score = claimed;
  let verification: (Verify & { engine: string }) | { engine: string; error: string };
  try {
    const v = await py<Verify>(
      "fast",
      "verify_score",
      {
        moves: history,
        mode: b.mode,
        difficulty: b.difficulty,
        playerColor: b.playerColor,
        score: claimed,
        result: b.result,
      },
      4000,
    );
    score = v.verified;
    verification = { ...v, engine: "python" };
  } catch (e) {
    verification = { engine: "none", error: e instanceof Error ? e.message : "unverified" };
    if (history.length === 0) score = Math.min(claimed, 5000);
  }

  try {
    const [row] = await db
      .insert(scores)
      .values({
        name: cleanName(b.name, "Anonymous"),
        score,
        mode: String(b.label ?? b.mode ?? "ai").slice(0, 20),
        result: String(b.result ?? "").slice(0, 60),
        moves: history.length,
      })
      .returning();
    return json({ score: row, verification });
  } catch (err) {
    console.error("Failed to save score:", err);
    return json({ error: "Failed to save score to database", verification }, 500);
  }
}
