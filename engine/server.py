"""
Neon Gambit game controller — persistent JSON-lines server.

Protocol (one JSON object per line):
  request : {"id": 1, "cmd": "ai", "args": {...}}
  response: {"id": 1, "ok": true, "result": {...}}  |  {"id": 1, "ok": false, "error": "..."}

Kept alive by the Next.js server (src/lib/pyengine.ts) so there is no per-request
interpreter start-up cost.
"""
from __future__ import annotations

import json
import os
import platform
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ai import best_move  # noqa: E402
from chess_core import START_FEN, Position, move_info, perft, replay  # noqa: E402
from scoring import RULES, verify_score  # noqa: E402

VERSION = "1.0.0"
STARTED = time.time()
STATS: dict = {}


def cmd_ping(_a):
    return {"pong": True, "version": VERSION, "python": platform.python_version(), "pid": os.getpid(),
            "uptime": int(time.time() - STARTED)}


def cmd_rules(_a):
    return RULES


def cmd_ai(a):
    return best_move(a.get("fen") or START_FEN, a.get("difficulty", "medium"), a.get("moves") or [])


def cmd_validate(a):
    """Validate & apply a move on top of a SAN history. Authoritative for online games."""
    moves = list(a.get("moves") or [])
    pos, _ = replay(moves)
    if pos.status()["over"]:
        raise ValueError("Game is already over")
    if a.get("color") and a["color"] != pos.turn:
        raise ValueError("Not your turn")
    m = pos.find_uci(a["from"], a["to"], a.get("promotion"))
    if m is None:
        raise ValueError("Illegal move")
    legal = pos.legal_moves()
    san = pos.san(m, legal)
    color = pos.turn
    pos.make(m, record=True)
    return {"san": san, "move": move_info(m, san, color), "fen": pos.fen(), "moves": moves + [san],
            "status": pos.status()}


def cmd_status(a):
    pos, _ = replay(list(a.get("moves") or []))
    return {"fen": pos.fen(), "turn": pos.turn, "status": pos.status()}


def cmd_legal(a):
    pos, _ = replay(list(a.get("moves") or []))
    legal = pos.legal_moves()
    return {"moves": [move_info(m, pos.san(m, legal), pos.turn) for m in legal]}


def cmd_verify_score(a):
    return verify_score(list(a.get("moves") or []), a.get("mode", "ai"), a.get("difficulty", "medium"),
                        a.get("playerColor"), int(a.get("score", 0)), a.get("result"))


def cmd_bench(_a):
    t = time.perf_counter()
    n = perft(Position(), 3)
    dt = time.perf_counter() - t
    return {"nodes": n, "ms": int(dt * 1000), "nps": int(n / dt) if dt else 0}


def cmd_stats(_a):
    return {"uptime": int(time.time() - STARTED), "commands": STATS}


COMMANDS = {
    "ping": cmd_ping,
    "rules": cmd_rules,
    "ai": cmd_ai,
    "validate": cmd_validate,
    "status": cmd_status,
    "legal": cmd_legal,
    "verify_score": cmd_verify_score,
    "bench": cmd_bench,
    "stats": cmd_stats,
}


def handle(line: str) -> dict:
    rid = None
    try:
        req = json.loads(line)
        rid = req.get("id")
        cmd = req.get("cmd")
        fn = COMMANDS.get(cmd)
        if fn is None:
            raise ValueError(f"unknown command: {cmd}")
        t = time.perf_counter()
        result = fn(req.get("args") or {})
        ms = (time.perf_counter() - t) * 1000
        s = STATS.setdefault(cmd, {"count": 0, "totalMs": 0.0})
        s["count"] += 1
        s["totalMs"] = round(s["totalMs"] + ms, 2)
        return {"id": rid, "ok": True, "result": result}
    except Exception as e:  # noqa: BLE001
        return {"id": rid, "ok": False, "error": str(e)}


def _watch_parent():
    """Exit if the Node.js parent dies, so engine processes never linger as orphans."""
    parent = os.getppid()
    while True:
        time.sleep(2)
        if os.getppid() != parent:
            os._exit(0)


def main():
    threading.Thread(target=_watch_parent, daemon=True).start()
    out = sys.stdout
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        out.write(json.dumps(handle(line), separators=(",", ":")) + "\n")
        out.flush()


if __name__ == "__main__":
    main()
