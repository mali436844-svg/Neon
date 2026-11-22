# Neon Gambit — Arcade Chess

An arcade chess experience built with **Next.js 16**, **React 19**, **TypeScript**, **Tailwind CSS**, and **Drizzle ORM**.

## Features
- **Arcade Chess Mechanics**: Combo multipliers, score popups, dynamic sound effects, particle blasts, screen shake, and speed bonuses.
- **Game Modes**:
  - **VS AI**: Multiple difficulty levels with in-browser Web Worker engine (and optional Python engine support).
  - **Local 2-Player**: Pass & play with board flip option.
  - **Online Multiplayer**: Real-time room creation, room codes, spectator mode, and optimistic move sync.
- **Leaderboards**: Local personal bests and global high-score table.
- **Admin Console**: Live room management, statistics, and featured game hosting at `/admin`.

## Quick Start (Local)

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   Copy `.env.example` to `.env.local`:
   ```bash
   copy .env.example .env.local
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment & Production

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for full instructions on deploying to **Vercel** with a **Custom Domain** and setting up **Neon / Supabase PostgreSQL**.

