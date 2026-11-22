"""Single source of truth for score rules + server-side score verification."""
from __future__ import annotations

from typing import List, Optional

from chess_core import replay

RULES = {
    "piece": {"p": 1, "n": 3, "b": 3, "r": 5, "q": 9, "k": 0},
    "captureUnit": 100,
    "comboCap": 5,
    "check": 50,
    "promotion": 500,
    "quick": 25,
    "quickMs": 3000,
    "winBase": 1500,
    "difficultyMult": {"easy": 1, "medium": 2, "hard": 3},
    "speedBase": 1200,
    "speedPerPly": 12,
    "draw": 300,
    "undoPenalty": 150,
}


def _winner_from_text(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    if text.startswith("White wins"):
        return "w"
    if text.startswith("Black wins"):
        return "b"
    return None


def max_score_for(details: List[dict], color: str, allow_quick: bool) -> int:
    """Upper bound for a colour's in-game points (before end-of-game bonuses)."""
    r = RULES
    total, combo = 0, 0
    for d in details:
        if d["color"] != color:
            continue
        if d["captured"]:
            combo += 1
            total += r["piece"][d["captured"]] * r["captureUnit"] * min(combo, r["comboCap"])
        else:
            combo = 0
        if d["check"]:
            total += r["check"]
        if d["promotion"]:
            total += r["promotion"]
        if allow_quick:
            total += r["quick"]
    return total


def verify_score(moves: List[str], mode: str, difficulty: str, player_color: Optional[str],
                 claimed: int, result_text: Optional[str] = None) -> dict:
    """Replays the game and caps the claimed score at the maximum legally achievable."""
    pos, details = replay(moves)
    st = pos.status()
    plies = len(moves)
    r = RULES

    if st["over"]:
        winner, drawn = st["winner"], st["winner"] is None
    else:
        # Resignations / admin endings aren't visible on the board.
        winner = _winner_from_text(result_text) if mode != "ai" else None
        if mode == "ai" and result_text and "resignation" in result_text:
            winner = "b" if player_color == "w" else "w"  # only the human can resign vs CPU
        drawn = False

    colors = ["w", "b"] if mode == "local" else [player_color or "w"]
    best = 0
    for c in colors:
        s = max_score_for(details, c, allow_quick=(mode != "online"))
        if winner == c:
            mult = r["difficultyMult"].get(difficulty, 1) if mode == "ai" else 1
            s += r["winBase"] * mult + max(0, r["speedBase"] - plies * r["speedPerPly"])
        elif drawn:
            s += r["draw"]
        best = max(best, s)

    verified = max(0, min(int(claimed), best))
    return {
        "verified": verified,
        "max": best,
        "claimed": int(claimed),
        "adjusted": verified != int(claimed),
        "status": st,
        "plies": plies,
    }
