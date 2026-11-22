"""Alpha-beta AI: iterative deepening, quiescence, MVV-LVA + killer ordering, check extension."""
from __future__ import annotations

import random
import time
from typing import List, Optional

from chess_core import PIECE_VALUE, Position, move_info, replay

MATE = 100000
V = {k.upper(): v for k, v in PIECE_VALUE.items()}
V.update(PIECE_VALUE)
V["k"] = V["K"] = 20000

LEVELS = {
    # max depth, time budget (s), quiescence, random-move chance, root noise
    "easy": (1, 0.25, False, 0.35, 60),
    "medium": (3, 0.8, True, 0.0, 0),
    "hard": (6, 1.6, True, 0.0, 0),
}


class Timeout(Exception):
    pass


class Searcher:
    def __init__(self, pos: Position, deadline: float, use_q: bool):
        self.pos = pos
        self.deadline = deadline
        self.use_q = use_q
        self.nodes = 0
        self.killers: dict = {}

    def order(self, moves, ply: int):
        k = self.killers.get(ply, ())

        def key(m):
            s = 0
            if m[3]:
                s = 10000 + 10 * V[m[3]] - V[m[2]] // 10
            if m[4]:
                s += 8000 + V[m[4]]
            if m in k:
                s += 5000
            return -s

        moves.sort(key=key)
        return moves

    def qsearch(self, alpha: int, beta: int, depth: int) -> int:
        pos = self.pos
        self.nodes += 1
        stand = pos.score if pos.turn == "w" else -pos.score
        if depth <= 0 or stand >= beta:
            return stand if stand < beta else beta
        if stand > alpha:
            alpha = stand
        me = pos.turn
        for m in self.order(pos.pseudo_moves(captures_only=True), 99):
            u = pos.make(m)
            if pos.in_check(me):
                pos.unmake(u)
                continue
            s = -self.qsearch(-beta, -alpha, depth - 1)
            pos.unmake(u)
            if s >= beta:
                return beta
            if s > alpha:
                alpha = s
        return alpha

    def negamax(self, depth: int, alpha: int, beta: int, ply: int) -> int:
        self.nodes += 1
        if (self.nodes & 1023) == 0 and time.perf_counter() > self.deadline:
            raise Timeout()
        pos = self.pos
        if pos.halfmove >= 100:
            return 0
        me = pos.turn
        in_check = pos.in_check(me)
        if in_check:
            depth += 1
        if depth <= 0:
            if self.use_q:
                return self.qsearch(alpha, beta, 4)
            return pos.score if me == "w" else -pos.score
        legal = 0
        best = -MATE * 2
        for m in self.order(pos.pseudo_moves(), ply):
            u = pos.make(m)
            if pos.in_check(me):
                pos.unmake(u)
                continue
            legal += 1
            s = -self.negamax(depth - 1, -beta, -alpha, ply + 1)
            pos.unmake(u)
            if s > best:
                best = s
            if s > alpha:
                alpha = s
            if alpha >= beta:
                if not m[3]:
                    ks = self.killers.setdefault(ply, [])
                    if m not in ks:
                        ks.insert(0, m)
                        del ks[2:]
                break
        if legal == 0:
            return -MATE + ply if in_check else 0
        return best


def best_move(fen: str, difficulty: str = "medium", moves: Optional[List[str]] = None) -> dict:
    if moves:
        pos, _ = replay(moves)
    else:
        pos = Position(fen)
    max_depth, budget, use_q, rand_chance, noise = LEVELS.get(difficulty, LEVELS["medium"])
    legal = pos.legal_moves()
    if not legal:
        return {"move": None, "san": None, "depth": 0, "nodes": 0, "score": 0}

    start = time.perf_counter()
    deadline = start + budget
    s = Searcher(pos, deadline, use_q)
    me = pos.turn

    if rand_chance and random.random() < rand_chance:
        m = random.choice(legal)
        info = move_info(m, pos.san(m, legal), me)
        return {"move": info, "san": info["san"], "depth": 0, "nodes": 1, "score": 0}

    snap = (list(pos.board), pos.turn, pos.castling, pos.ep, pos.halfmove, pos.fullmove,
            dict(pos.kings), pos.score, list(pos.history))
    root = s.order(list(legal), 0)
    best, best_score, depth_done = root[0], 0, 0
    for depth in range(1, max_depth + 1):
        try:
            scored = []
            alpha = -MATE * 2
            for m in root:
                u = pos.make(m)
                # with noise every root score must be exact -> full window
                sc = -s.negamax(depth - 1, -MATE * 2, MATE * 2 if noise else -alpha, 1)
                pos.unmake(u)
                if noise and abs(sc) < MATE - 100:
                    sc += random.randint(-noise, noise)
                scored.append((sc, m))
                if sc > alpha:
                    alpha = sc
            scored.sort(key=lambda x: -x[0])
            best_score, best = scored[0]
            root = [m for _, m in scored]
            depth_done = depth
            if best_score > MATE - 100:
                break  # found a forced mate
        except Timeout:
            # the exception unwound without unmake(): restore the snapshot
            (pos.board, pos.turn, pos.castling, pos.ep, pos.halfmove, pos.fullmove,
             pos.kings, pos.score, pos.history) = snap
            break
        if time.perf_counter() - start > budget * 0.55:
            break  # not enough time for another full iteration

    info = move_info(best, pos.san(best, legal), me)
    return {
        "move": info,
        "san": info["san"],
        "depth": depth_done,
        "nodes": s.nodes,
        "score": best_score,
        "ms": int((time.perf_counter() - start) * 1000),
    }
