# Neon Gambit Chess — Deployment & Operations Guide

This guide walks you through deploying **Neon Gambit Chess** to **Vercel** with a **Custom Domain**, setting up the **PostgreSQL Database**, and configuring **Environment Variables**.

---

## 1. Project Health & Audit Summary

The repository has been thoroughly audited and verified:
- **TypeScript**: `npm run typecheck` (`tsc --noEmit`) passes with **0 errors**.
- **ESLint**: `npm run lint` passes with **0 errors and 0 warnings**.
- **Production Build**: `npm run build` compiles cleanly into optimized static assets and serverless routes.
- **Resilience**: The API routes (`/api/games`, `/api/scores`, `/api/admin`) include defensive fallbacks so that local single-player vs AI and 2-player modes work even if the database is temporarily unreachable.
- **AI Fallback**: On Vercel serverless environments, the chess engine automatically falls back to the client-side Web Worker (`ai.worker.ts`), providing instant, lag-free AI move generation without requiring Python in serverless functions.

---

## 2. Environment Variables Reference

Create or configure these variables in `.env.local` (for local development) and in the **Vercel Dashboard** under **Project Settings → Environment Variables**:

| Variable Name | Required | Default / Example | Purpose |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Yes** (for online play & leaderboards) | `postgresql://user:pass@ep-cool-123.neon.tech/neondb?sslmode=require` | PostgreSQL database connection string (Neon, Supabase, Vercel Postgres). |
| `ADMIN_PASSWORD` | **Yes** (for admin panel) | `your-secure-admin-pass` | Secret password required to access `/admin` dashboard and moderate rooms/scores. |
| `PYTHON_BIN` | No (local dev only) | `python3` | Optional path to Python binary for local Python engine. |
| `ENGINE_DIR` | No (local dev only) | `./engine` | Optional path to Python engine script directory. |

---

## 3. Database Setup (Free PostgreSQL with Neon or Supabase)

Neon or Supabase provide fast, free, serverless PostgreSQL that pairs seamlessly with Vercel:

### Option A: Free Serverless Postgres on Neon.tech (Recommended)
1. Go to [https://neon.tech](https://neon.tech) and create a free account.
2. Click **Create Project**, name it `neon-gambit`, and choose the region closest to your audience.
3. In your Neon dashboard, copy the **Connection Details** string (choose **Pooled Connection** or **Direct**; pooled is recommended: format `postgresql://...`).
4. Ensure `?sslmode=require` is at the end of the connection string.

### Option B: Push Database Tables (One-Time Setup)
Once you have your `DATABASE_URL`:
1. In your local terminal inside this folder, open `.env.local` and paste your connection string:
   ```env
   DATABASE_URL=postgresql://user:password@your-neon-host/neondb?sslmode=require
   ADMIN_PASSWORD=your-secure-admin-password
   ```
2. Run the Drizzle schema push command to create all tables (`games` and `scores`) automatically:
   ```bash
   npm run db:push
   ```
   *Drizzle Kit will connect to your PostgreSQL instance and create the tables immediately.*

---

## 4. Deploying to Vercel

### Method 1: Deploy via GitHub & Vercel Dashboard (Easiest & Automatic CI/CD)
1. **Push your code to GitHub**:
   - Create a new repository on [GitHub](https://github.com/new) (e.g. `neon-gambit-chess`).
   - Push your code to the repository:
     ```bash
     git init
     git add .
     git commit -m "Initial commit - clean build"
     git branch -M main
     git remote add origin https://github.com/<your-username>/neon-gambit-chess.git
     git push -u origin main
     ```
2. **Import into Vercel**:
   - Go to [https://vercel.com](https://vercel.com) and log in.
   - Click **Add New... → Project**.
   - Select your `neon-gambit-chess` GitHub repository and click **Import**.
   - Under **Framework Preset**, Next.js is automatically detected.
   - Expand the **Environment Variables** section and add:
     - `DATABASE_URL`: Your PostgreSQL connection string.
     - `ADMIN_PASSWORD`: A secure secret string for the `/admin` console.
   - Click **Deploy**. Vercel will build and launch your application in under 60 seconds!

---

### Method 2: Deploy directly via Vercel CLI (No Git required)
If you prefer deploying directly from your computer terminal without using Git:
1. Install Vercel CLI globally:
   ```bash
   npm install -g vercel
   ```
2. Run:
   ```bash
   vercel
   ```
3. Follow the CLI prompts to link your project and deploy.
4. To deploy to production:
   ```bash
   vercel --prod
   ```
5. Add your environment variables in the Vercel dashboard or via CLI:
   ```bash
   vercel env add DATABASE_URL
   vercel env add ADMIN_PASSWORD
   ```

---

## 5. Adding a Custom Domain on Vercel

To attach your own domain (e.g., `mychessgame.com` or `play.mychessgame.com`):

### Step 1: Add Domain in Vercel
1. In the Vercel dashboard, navigate to your project.
2. Go to **Settings → Domains**.
3. Type your domain name (e.g., `mychessgame.com` or `play.mychessgame.com`) and click **Add**.
4. Vercel will recommend adding both:
   - `mychessgame.com` (Apex)
   - `www.mychessgame.com` (with automatic redirect to Apex)

### Step 2: Configure DNS Records at your Domain Registrar
Log in to wherever you purchased your domain (Namecheap, GoDaddy, Cloudflare, Google Domains/Squarespace, Hostinger, etc.) and open your DNS management page:

#### For Root / Apex Domain (`mychessgame.com`):
| Type | Name / Host | Value / Target | TTL |
| :--- | :--- | :--- | :--- |
| **A** | `@` (or leave blank) | `76.76.21.21` | Auto or 3600 |

#### For `www` or Subdomain (`www.mychessgame.com` or `play.mychessgame.com`):
| Type | Name / Host | Value / Target | TTL |
| :--- | :--- | :--- | :--- |
| **CNAME** | `www` (or `play`) | `cname.vercel-dns.com` | Auto or 3600 |

> **Note for Cloudflare users**: If managing DNS via Cloudflare, set the Proxy status to **DNS only** (gray cloud) during initial verification so Vercel can automatically issue the free Let's Encrypt SSL certificate. Once Vercel shows "Valid Configuration", you can re-enable Cloudflare proxying if desired.

### Step 3: Verification & Automatic SSL
- Within 1–15 minutes, Vercel will verify the DNS records.
- Vercel automatically generates and renews a free **SSL / HTTPS Certificate**.
- Your game is now live and accessible at your custom domain!

---

## 6. Accessing the Admin Console

- Navigate to `https://your-domain.com/admin`
- Enter the password configured in `ADMIN_PASSWORD`.
- In the dashboard, you can:
  - Monitor active and waiting online rooms.
  - Feature rooms for the public room list.
  - Terminate or purge finished rooms.
  - View global leaderboard scores.

