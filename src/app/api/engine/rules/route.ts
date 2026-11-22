import { json } from "@/lib/server";
import { py } from "@/lib/pyengine";
import { DEFAULT_RULES, type Rules } from "@/lib/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json(await py<Rules>("fast", "rules", {}, 3000));
  } catch {
    return json(DEFAULT_RULES);
  }
}
