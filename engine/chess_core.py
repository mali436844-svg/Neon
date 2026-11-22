"""
Pure-stdlib chess rules engine (10x12 mailbox).

Board indices: a8 = 21 ... h8 = 28, a1 = 91 ... h1 = 98.
Pieces: uppercase = white, lowercase = black, '.' = empty, ' ' = off-board.
Moves are tuples: (frm, to, piece, captured, promo, flags)
"""
from __future__ import annotations

from typing import List, Optional, Tuple

START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

EP, CASTLE, DOUBLE = 1, 2, 4
N, S, E, W = -10, 10, 1, -1
KNIGHT = (-21, -19, -12, -8, 8, 12, 19, 21)
KING = (-11, -10, -9, -1, 1, 9, 10, 11)
BISHOP = (-11, -9, 9, 11)
ROOK = (-10, -1, 1, 10)
FILES = "abcdefgh"

Move = Tuple[int, int, str, str, str, int]

CASTLE_MASK = {91: "Q", 98: "K", 95: "KQ", 21: "q", 28: "k", 25: "kq"}

# ---- evaluation tables (centipawns, white perspective, a8 first) ----
PIECE_VALUE = {"p": 100, "n": 320, "b": 330, "r": 500, "q": 900, "k": 0}
_PST64 = {
    "p": [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
          0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    "n": [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15,
          20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40,
          -50, -40, -30, -30, -30, -30, -40, -50],
    "b": [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10,
          5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10,
          -10, -10, -10, -10, -10, -20],
    "r": [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0,
          0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    "q": [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0,
          -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10,
          -20],
    "k": [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40,
          -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20,
          -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
}


def idx64(sq: int) -> int:
    return (sq // 10 - 2) * 8 + (sq % 10 - 1)


def _build_table():
    """TABLE[piece][sq120] = signed (white +, black -) material + positional value."""
    t = {}
    for p, pst in _PST64.items():
        w = [0] * 120
        b = [0] * 120
        for sq in range(21, 99):
            if not 1 <= sq % 10 <= 8:
                continue
            i = idx64(sq)
            mirrored = (7 - i // 8) * 8 + i % 8
            w[sq] = PIECE_VALUE[p] + pst[i]
            b[sq] = -(PIECE_VALUE[p] + pst[mirrored])
        t[p.upper()] = w
        t[p] = b
    return t


TABLE = _build_table()


def sq_name(sq: int) -> str:
    return FILES[sq % 10 - 1] + str(10 - sq // 10)


def parse_sq(s: str) -> int:
    return 21 + (8 - int(s[1])) * 10 + (ord(s[0]) - 97)


class Position:
    __slots__ = ("board", "turn", "castling", "ep", "halfmove", "fullmove", "kings", "score", "history")

    def __init__(self, fen: str = START_FEN):
        self.load(fen)

    # ---------- FEN ----------
    def load(self, fen: str):
        parts = fen.split()
        b = [" "] * 120
        rows = parts[0].split("/")
        if len(rows) != 8:
            raise ValueError("bad fen")
        self.kings = {"w": 0, "b": 0}
        for r, row in enumerate(rows):
            f = 0
            for ch in row:
                if ch.isdigit():
                    for _ in range(int(ch)):
                        b[21 + r * 10 + f] = "."
                        f += 1
                else:
                    sq = 21 + r * 10 + f
                    b[sq] = ch
                    if ch == "K":
                        self.kings["w"] = sq
                    elif ch == "k":
                        self.kings["b"] = sq
                    f += 1
        self.board = b
        self.turn = parts[1] if len(parts) > 1 else "w"
        c = parts[2] if len(parts) > 2 else "-"
        self.castling = "" if c == "-" else c
        e = parts[3] if len(parts) > 3 else "-"
        self.ep = None if e == "-" else parse_sq(e)
        self.halfmove = int(parts[4]) if len(parts) > 4 else 0
        self.fullmove = int(parts[5]) if len(parts) > 5 else 1
        self.score = sum(TABLE[p][sq] for sq, p in enumerate(b) if p not in " .")
        self.history = [self.key()]

    def fen(self) -> str:
        rows = []
        for r in range(8):
            row, empty = "", 0
            for f in range(8):
                p = self.board[21 + r * 10 + f]
                if p == ".":
                    empty += 1
                else:
                    if empty:
                        row += str(empty)
                        empty = 0
                    row += p
            if empty:
                row += str(empty)
            rows.append(row)
        ep = "-"
        if self.ep is not None and self._ep_capturable():
            ep = sq_name(self.ep)
        return f"{'/'.join(rows)} {self.turn} {self.castling or '-'} {ep} {self.halfmove} {self.fullmove}"

    def _ep_capturable(self) -> bool:
        if self.ep is None:
            return False
        pawn = "P" if self.turn == "w" else "p"
        d = 10 if self.turn == "w" else -10
        return any(self.board[self.ep + d + s] == pawn for s in (-1, 1))

    def key(self) -> str:
        ep = sq_name(self.ep) if self.ep is not None and self._ep_capturable() else "-"
        return "".join(self.board[21:99]) + self.turn + self.castling + ep

    # ---------- attacks ----------
    def attacked(self, sq: int, by: str) -> bool:
        b = self.board
        if by == "w":
            if b[sq + 9] == "P" or b[sq + 11] == "P":
                return True
            n, k, bq, rq = "N", "K", "BQ", "RQ"
        else:
            if b[sq - 9] == "p" or b[sq - 11] == "p":
                return True
            n, k, bq, rq = "n", "k", "bq", "rq"
        for d in KNIGHT:
            if b[sq + d] == n:
                return True
        for d in KING:
            if b[sq + d] == k:
                return True
        for d in BISHOP:
            t = sq + d
            while b[t] == ".":
                t += d
            if b[t] in bq:
                return True
        for d in ROOK:
            t = sq + d
            while b[t] == ".":
                t += d
            if b[t] in rq:
                return True
        return False

    def in_check(self, color: Optional[str] = None) -> bool:
        c = color or self.turn
        return self.attacked(self.kings[c], "b" if c == "w" else "w")

    # ---------- move generation ----------
    def pseudo_moves(self, captures_only: bool = False) -> List[Move]:
        b = self.board
        white = self.turn == "w"
        own = str.isupper if white else str.islower
        moves: List[Move] = []
        add = moves.append
        for sq in range(21, 99):
            p = b[sq]
            if p in " ." or not own(p):
                continue
            u = p.upper()
            if u == "P":
                fwd = N if white else S
                last_rank = (21 <= sq + fwd <= 28) if white else (91 <= sq + fwd <= 98)
                start_rank = (81 <= sq <= 88) if white else (31 <= sq <= 38)
                for cd in (fwd - 1, fwd + 1):
                    t = sq + cd
                    tp = b[t]
                    if tp not in " ." and own(tp) is False:
                        if last_rank:
                            for pr in ("q", "r", "b", "n"):
                                add((sq, t, p, tp, pr, 0))
                        else:
                            add((sq, t, p, tp, "", 0))
                    elif t == self.ep and tp == ".":
                        add((sq, t, p, "p" if white else "P", "", EP))
                if captures_only:
                    if last_rank and b[sq + fwd] == ".":
                        add((sq, sq + fwd, p, "", "q", 0))
                    continue
                t = sq + fwd
                if b[t] == ".":
                    if last_rank:
                        for pr in ("q", "r", "b", "n"):
                            add((sq, t, p, "", pr, 0))
                    else:
                        add((sq, t, p, "", "", 0))
                        if start_rank and b[t + fwd] == ".":
                            add((sq, t + fwd, p, "", "", DOUBLE))
            elif u == "N" or u == "K":
                for d in KNIGHT if u == "N" else KING:
                    t = sq + d
                    tp = b[t]
                    if tp == ".":
                        if not captures_only:
                            add((sq, t, p, "", "", 0))
                    elif tp != " " and not own(tp):
                        add((sq, t, p, tp, "", 0))
                if u == "K" and not captures_only:
                    self._castles(sq, moves)
            else:
                dirs = BISHOP if u == "B" else ROOK if u == "R" else KING
                for d in dirs:
                    t = sq + d
                    while True:
                        tp = b[t]
                        if tp == ".":
                            if not captures_only:
                                add((sq, t, p, "", "", 0))
                        else:
                            if tp != " " and not own(tp):
                                add((sq, t, p, tp, "", 0))
                            break
                        t += d
        return moves

    def _castles(self, sq: int, moves: List[Move]):
        b = self.board
        if self.turn == "w":
            if sq != 95:
                return
            ks, qs, rook, enemy = "K", "Q", "R", "b"
        else:
            if sq != 25:
                return
            ks, qs, rook, enemy = "k", "q", "r", "w"
        if ks in self.castling and b[sq + 1] == "." and b[sq + 2] == "." and b[sq + 3] == rook:
            if not (self.attacked(sq, enemy) or self.attacked(sq + 1, enemy) or self.attacked(sq + 2, enemy)):
                moves.append((sq, sq + 2, b[sq], "", "", CASTLE))
        if qs in self.castling and b[sq - 1] == "." and b[sq - 2] == "." and b[sq - 3] == "." and b[sq - 4] == rook:
            if not (self.attacked(sq, enemy) or self.attacked(sq - 1, enemy) or self.attacked(sq - 2, enemy)):
                moves.append((sq, sq - 2, b[sq], "", "", CASTLE))

    def legal_moves(self) -> List[Move]:
        out = []
        me = self.turn
        for m in self.pseudo_moves():
            u = self.make(m)
            if not self.in_check(me):
                out.append(m)
            self.unmake(u)
        return out

    # ---------- make / unmake ----------
    def make(self, m: Move, record: bool = False):
        frm, to, piece, cap, promo, flags = m
        b = self.board
        T = TABLE
        undo = (m, self.castling, self.ep, self.halfmove, self.fullmove, self.score)
        white = piece.isupper()
        sc = self.score - T[piece][frm]
        if flags & EP:
            capsq = to + (10 if white else -10)
            b[capsq] = "."
            sc -= T[cap][capsq]
        elif cap:
            sc -= T[cap][to]
        newp = (promo.upper() if white else promo) if promo else piece
        b[to] = newp
        b[frm] = "."
        sc += T[newp][to]
        if flags & CASTLE:
            if to > frm:
                rf, rt = frm + 3, frm + 1
            else:
                rf, rt = frm - 4, frm - 1
            r = b[rf]
            b[rt] = r
            b[rf] = "."
            sc += T[r][rt] - T[r][rf]
        if piece == "K":
            self.kings["w"] = to
        elif piece == "k":
            self.kings["b"] = to
        if self.castling:
            c = self.castling
            for s in (frm, to):
                mask = CASTLE_MASK.get(s)
                if mask:
                    for ch in mask:
                        c = c.replace(ch, "")
            self.castling = c
        self.ep = (frm + to) // 2 if flags & DOUBLE else None
        self.halfmove = 0 if (piece in "Pp" or cap) else self.halfmove + 1
        if not white:
            self.fullmove += 1
        self.turn = "b" if white else "w"
        self.score = sc
        if record:
            self.history.append(self.key())
        return undo

    def unmake(self, undo, record: bool = False):
        m, castling, ep, half, full, score = undo
        frm, to, piece, cap, promo, flags = m
        b = self.board
        b[frm] = piece
        if flags & EP:
            b[to] = "."
            b[to + (10 if piece.isupper() else -10)] = cap
        else:
            b[to] = cap or "."
        if flags & CASTLE:
            if to > frm:
                rf, rt = frm + 3, frm + 1
            else:
                rf, rt = frm - 4, frm - 1
            b[rf] = b[rt]
            b[rt] = "."
        if piece == "K":
            self.kings["w"] = frm
        elif piece == "k":
            self.kings["b"] = frm
        self.castling, self.ep, self.halfmove, self.fullmove, self.score = castling, ep, half, full, score
        self.turn = "w" if piece.isupper() else "b"
        if record and len(self.history) > 1:
            self.history.pop()

    # ---------- SAN ----------
    def san(self, m: Move, legal: Optional[List[Move]] = None) -> str:
        frm, to, piece, cap, promo, flags = m
        u = piece.upper()
        if flags & CASTLE:
            s = "O-O" if to > frm else "O-O-O"
        elif u == "P":
            s = (sq_name(frm)[0] + "x" if cap else "") + sq_name(to)
            if promo:
                s += "=" + promo.upper()
        else:
            legal = legal if legal is not None else self.legal_moves()
            others = [x for x in legal if x[2] == piece and x[1] == to and x[0] != frm]
            dis = ""
            if others:
                fn, rn = sq_name(frm)
                same_file = any(sq_name(x[0])[0] == fn for x in others)
                same_rank = any(sq_name(x[0])[1] == rn for x in others)
                if not same_file:
                    dis = fn
                elif not same_rank:
                    dis = rn
                else:
                    dis = fn + rn
            s = u + dis + ("x" if cap else "") + sq_name(to)
        undo = self.make(m)
        if self.in_check():
            s += "#" if not self.legal_moves() else "+"
        self.unmake(undo)
        return s

    def find_san(self, san: str) -> Optional[Move]:
        target = san.rstrip("+#!?")
        legal = self.legal_moves()
        for m in legal:
            if self.san(m, legal).rstrip("+#") == target:
                return m
        return None

    def find_uci(self, frm: str, to: str, promo: Optional[str] = None) -> Optional[Move]:
        f, t = parse_sq(frm), parse_sq(to)
        cands = [m for m in self.legal_moves() if m[0] == f and m[1] == t]
        if not cands:
            return None
        if len(cands) > 1 or cands[0][4]:
            p = (promo or "q").lower()
            for m in cands:
                if m[4] == p:
                    return m
            return None
        return cands[0]

    # ---------- game status ----------
    def insufficient(self) -> bool:
        minors = []
        for sq in range(21, 99):
            p = self.board[sq]
            if p in " .Kk":
                continue
            if p in "PpRrQq":
                return False
            minors.append((p, sq))
        if len(minors) <= 1:
            return True
        if all(p in "Bb" for p, _ in minors):
            colors = {(sq // 10 + sq % 10) % 2 for _, sq in minors}
            return len(colors) == 1
        return False

    def status(self) -> dict:
        legal = self.legal_moves()
        check = self.in_check()
        if not legal:
            if check:
                winner = "b" if self.turn == "w" else "w"
                return {"over": True, "winner": winner,
                        "text": f"{'White' if winner == 'w' else 'Black'} wins by checkmate", "check": True}
            return {"over": True, "winner": None, "text": "Draw by stalemate", "check": False}
        if self.insufficient():
            return {"over": True, "winner": None, "text": "Draw — insufficient material", "check": check}
        if self.history.count(self.history[-1]) >= 3:
            return {"over": True, "winner": None, "text": "Draw by repetition", "check": check}
        if self.halfmove >= 100:
            return {"over": True, "winner": None, "text": "Draw — 50-move rule", "check": check}
        return {"over": False, "winner": None, "text": None, "check": check}


def replay(moves: List[str], fen: str = START_FEN) -> Tuple[Position, List[dict]]:
    """Replay SAN moves; returns position and per-move detail (used for scoring/validation)."""
    pos = Position(fen)
    details = []
    for san in moves:
        legal = pos.legal_moves()
        m = None
        target = san.rstrip("+#!?")
        for x in legal:
            if pos.san(x, legal).rstrip("+#") == target:
                m = x
                break
        if m is None:
            raise ValueError(f"illegal move in history: {san}")
        full = pos.san(m, legal)
        color = pos.turn
        pos.make(m, record=True)
        details.append(move_info(m, full, color))
    return pos, details


def move_info(m: Move, san: str, color: str) -> dict:
    frm, to, piece, cap, promo, flags = m
    return {
        "from": sq_name(frm),
        "to": sq_name(to),
        "piece": piece.lower(),
        "captured": cap.lower() if cap else None,
        "promotion": promo or None,
        "san": san,
        "color": color,
        "check": san.endswith("+") or san.endswith("#"),
    }


def perft(pos: Position, depth: int) -> int:
    if depth == 0:
        return 1
    n = 0
    me = pos.turn
    for m in pos.pseudo_moves():
        u = pos.make(m)
        if not pos.in_check(me):
            n += perft(pos, depth - 1) if depth > 1 else 1
        pos.unmake(u)
    return n
