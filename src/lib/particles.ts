type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 0 | 1 | 2; // 0 spark, 1 shard (rotating square), 2 ring
  rot: number;
  vr: number;
  g: number;
};

export class ParticleSystem {
  private ps: P[] = [];
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;

  attach(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
    this.resize(canvas);
  }

  resize(canvas: HTMLCanvasElement) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  get width() {
    return this.w;
  }
  get height() {
    return this.h;
  }

  private add(p: Partial<P> & { x: number; y: number }) {
    if (this.ps.length > 600) return;
    this.ps.push({
      vx: 0,
      vy: 0,
      life: 0,
      max: 0.8,
      size: 4,
      color: "#fff",
      kind: 0,
      rot: 0,
      vr: 0,
      g: 0,
      ...p,
    });
  }

  burst(x: number, y: number, colors: string[], count = 28, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (80 + Math.random() * 260) * power;
      this.add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 60,
        max: 0.5 + Math.random() * 0.6,
        size: 2 + Math.random() * 5 * power,
        color: colors[i % colors.length],
        kind: Math.random() < 0.5 ? 1 : 0,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 20,
        g: 500,
      });
    }
    this.add({ x, y, max: 0.45, size: 8, color: colors[0], kind: 2 });
    this.start();
  }

  ring(x: number, y: number, color: string, size = 10) {
    this.add({ x, y, max: 0.6, size, color, kind: 2 });
    this.start();
  }

  sparkle(x: number, y: number, color: string, count = 8) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * 80;
      this.add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        max: 0.35 + Math.random() * 0.25,
        size: 1.5 + Math.random() * 2.5,
        color,
      });
    }
    this.start();
  }

  confetti(count = 160) {
    const colors = ["#22d3ee", "#a78bfa", "#f472b6", "#facc15", "#34d399", "#fb923c"];
    for (let i = 0; i < count; i++) {
      this.add({
        x: Math.random() * this.w,
        y: -20 - Math.random() * this.h * 0.5,
        vx: (Math.random() - 0.5) * 120,
        vy: 80 + Math.random() * 200,
        max: 2.5 + Math.random() * 1.5,
        size: 4 + Math.random() * 6,
        color: colors[i % colors.length],
        kind: 1,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 12,
        g: 120,
      });
    }
    this.start();
  }

  private start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.step(dt);
      if (this.ps.length > 0) this.raf = requestAnimationFrame(loop);
      else {
        this.raf = 0;
        this.ctx?.clearRect(0, 0, this.w, this.h);
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  private step(dt: number) {
    const c = this.ctx;
    if (!c) return;
    c.clearRect(0, 0, this.w, this.h);
    let j = 0;
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy += p.g * dt;
      p.vx *= 1 - 1.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const k = 1 - p.life / p.max;
      c.globalAlpha = Math.min(1, k * 1.5);
      if (p.kind === 2) {
        c.strokeStyle = p.color;
        c.lineWidth = 3 * k;
        c.beginPath();
        c.arc(p.x, p.y, p.size + (1 - k) * 60, 0, Math.PI * 2);
        c.stroke();
      } else if (p.kind === 1) {
        c.fillStyle = p.color;
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        c.restore();
      } else {
        c.fillStyle = p.color;
        c.beginPath();
        c.arc(p.x, p.y, p.size * k, 0, Math.PI * 2);
        c.fill();
      }
      this.ps[j++] = p;
    }
    this.ps.length = j;
    c.globalAlpha = 1;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ps = [];
  }
}
