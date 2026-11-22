"""Correctness + speed checks. Run: python3 engine/test_engine.py"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from chess_core import Position, perft, replay  # noqa: E402
from ai import best_move  # noqa: E402
from scoring import verify_score  # noqa: E402

CASES = [
    ("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", [20, 400, 8902]),
    ("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", [48, 2039]),
    ("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", [14, 191, 2812]),
    ("r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", [6, 264, 9467]),
]


def main():
    ok = True
    t0 = time.time()
    nodes = 0
    for fen, expected in CASES:
        pos = Position(fen)
        for d, exp in enumerate(expected, 1):
            got = perft(pos, d)
            nodes += got
            flag = "OK " if got == exp else "FAIL"
            ok &= got == exp
            print(f"{flag} perft({d}) = {got:>6} (expected {exp}) :: {fen[:30]}")
    dt = time.time() - t0
    print(f"perft speed: {int(nodes / dt)} nodes/s")

    pos, details = replay(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"])
    st = pos.status()
    print("scholar's mate:", st["text"], details[-1]["san"])
    ok &= st["winner"] == "w"

    for d in ("easy", "medium", "hard"):
        t = time.time()
        r = best_move("r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 3", d, [])
        print(f"ai {d}: {r['san']} depth={r['depth']} nodes={r['nodes']} {int((time.time() - t) * 1000)}ms")
        ok &= r["san"] == "Qxf7#"

    v = verify_score(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"], "ai", "medium", "w", 999999)
    print("verify score:", v)
    print("ALL OK" if ok else "SOME FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
