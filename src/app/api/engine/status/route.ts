import { json } from "@/lib/server";
import { py, pyPool } from "@/lib/pyengine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ping = await py<{ version: string; python: string }>("fast", "ping", {}, 3000);
    return json({ online: true, engine: "python", ...ping, processes: pyPool.info() });
  } catch (e) {
    return json({ online: false, error: e instanceof Error ? e.message : "down", processes: pyPool.info() });
  }
}
