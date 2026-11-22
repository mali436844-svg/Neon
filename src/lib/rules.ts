export type Rules = {
  piece: Record<string, number>;
  captureUnit: number;
  comboCap: number;
  check: number;
  promotion: number;
  quick: number;
  quickMs: number;
  winBase: number;
  difficultyMult: Record<string, number>;
  speedBase: number;
  speedPerPly: number;
  draw: number;
  undoPenalty: number;
};

/** Fallback copy — the authoritative values live in engine/scoring.py and are fetched at startup. */
export const DEFAULT_RULES: Rules = {
  piece: { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 },
  captureUnit: 100,
  comboCap: 5,
  check: 50,
  promotion: 500,
  quick: 25,
  quickMs: 3000,
  winBase: 1500,
  difficultyMult: { easy: 1, medium: 2, hard: 3 },
  speedBase: 1200,
  speedPerPly: 12,
  draw: 300,
  undoPenalty: 150,
};

export const RULES: Rules = { ...DEFAULT_RULES };
let loaded = false;

export async function loadRules() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const r = await fetch("/api/engine/rules");
    if (r.ok) Object.assign(RULES, (await r.json()) as Rules);
  } catch {
    /* keep defaults */
  }
}
