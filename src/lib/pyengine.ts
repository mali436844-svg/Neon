import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

/** Raised when Python answered but rejected the request (e.g. illegal move). */
export class EngineRuleError extends Error {}
/** Raised when the Python process is unavailable / crashed / timed out. */
export class EngineDownError extends Error {}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

class PyProc {
  proc: ChildProcessWithoutNullStreams | null = null;
  pending = new Map<number, Pending>();
  buf = "";
  seq = 0;
  served = 0;
  restarts = 0;
  startedAt = 0;
  lastError: string | null = null;

  constructor(public name: string) {}

  private ensure(): ChildProcessWithoutNullStreams {
    if (this.proc) return this.proc;
    const script = [process.env.ENGINE_DIR || process.cwd() + "/engine", "server.py"].join("/");
    const p = spawn(/* turbopackIgnore: true */ process.env.PYTHON_BIN || "python3", ["-u", script], {
      stdio: "pipe",
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", PYTHONUNBUFFERED: "1" },
    });
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (chunk: string) => {
      this.buf += chunk;
      let i: number;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 1);
        this.onLine(line);
      }
    });
    p.stderr.on("data", (d) => {
      this.lastError = String(d).slice(-400);
    });
    p.stdin.on("error", () => {});
    p.on("exit", (code) => {
      if (this.proc === p) this.fail(`Python engine exited (${code ?? "signal"})`);
    });
    p.on("error", (e) => {
      if (this.proc === p) this.fail(e.message);
    });
    this.proc = p;
    this.startedAt = Date.now();
    return p;
  }

  private fail(msg: string) {
    this.proc = null;
    this.buf = "";
    this.restarts++;
    this.lastError = msg;
    for (const pd of this.pending.values()) {
      clearTimeout(pd.timer);
      pd.reject(new EngineDownError(msg));
    }
    this.pending.clear();
  }

  private onLine(line: string) {
    let msg: { id: number; ok: boolean; result?: unknown; error?: string };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const pd = this.pending.get(msg.id);
    if (!pd) return;
    this.pending.delete(msg.id);
    clearTimeout(pd.timer);
    this.served++;
    if (msg.ok) pd.resolve(msg.result);
    else pd.reject(new EngineRuleError(msg.error ?? "Engine error"));
  }

  call<T>(cmd: string, args: unknown, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let p: ChildProcessWithoutNullStreams;
      try {
        p = this.ensure();
      } catch (e) {
        reject(new EngineDownError(e instanceof Error ? e.message : "spawn failed"));
        return;
      }
      const id = ++this.seq;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new EngineDownError("Python engine timeout"));
        this.kill(); // a stuck process is recycled; the next call respawns it
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      p.stdin.write(JSON.stringify({ id, cmd, args }) + "\n");
    });
  }

  kill() {
    const p = this.proc;
    if (!p) return;
    this.fail("Engine restarted");
    p.kill();
  }

  info() {
    return {
      name: this.name,
      alive: !!this.proc,
      pid: this.proc?.pid ?? null,
      pending: this.pending.size,
      served: this.served,
      restarts: this.restarts,
      uptimeSec: this.proc ? Math.round((Date.now() - this.startedAt) / 1000) : 0,
      lastError: this.lastError,
    };
  }
}

type Lane = "ai" | "fast";

class PyPool {
  lanes: Record<Lane, PyProc[]> = {
    // AI searches can take ~1.6s, so they get their own processes and never block move validation.
    ai: [new PyProc("ai-1"), new PyProc("ai-2")],
    fast: [new PyProc("fast-1")],
  };

  call<T>(lane: Lane, cmd: string, args: unknown = {}, timeoutMs = 5000): Promise<T> {
    const procs = this.lanes[lane];
    const proc = procs.reduce((a, b) => (b.pending.size < a.pending.size ? b : a));
    return proc.call<T>(cmd, args, timeoutMs);
  }

  restart() {
    for (const l of Object.values(this.lanes)) for (const p of l) p.kill();
  }

  info() {
    return Object.values(this.lanes).flat().map((p) => p.info());
  }
}

const g = globalThis as typeof globalThis & { __neonPyPool?: PyPool };
export const pyPool: PyPool = g.__neonPyPool ?? (g.__neonPyPool = new PyPool());

export function py<T>(lane: Lane, cmd: string, args: unknown = {}, timeoutMs?: number) {
  return pyPool.call<T>(lane, cmd, args, timeoutMs);
}

// ---- shared result types ----
export type PyMove = {
  from: string;
  to: string;
  piece: string;
  captured: string | null;
  promotion: string | null;
  san: string;
  color: "w" | "b";
  check: boolean;
};
export type PyStatus = { over: boolean; winner: "w" | "b" | null; text: string | null; check: boolean };
