export type HighScore = { name: string; score: number; mode: string; result: string; date: number };

const KEY = "neon-chess-highscores";

export function loadHighScores(): HighScore[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function qualifies(score: number): boolean {
  const list = loadHighScores();
  return score > 0 && (list.length < 10 || score > list[list.length - 1].score);
}

export function saveHighScore(h: HighScore): HighScore[] {
  const list = [...loadHighScores(), h].sort((a, b) => b.score - a.score).slice(0, 10);
  localStorage.setItem(KEY, JSON.stringify(list));
  return list;
}

export function clearHighScores() {
  localStorage.removeItem(KEY);
}

export function getName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("neon-chess-name") || "";
}
export function setName(n: string) {
  localStorage.setItem("neon-chess-name", n);
}
