# OPSYNC — Manual Production Deployment Guide

**Project:** OPSYNC  
**Project Owner:** Prathmesh Yadav  
**GitHub Username:** `Prathmesh-Yadav0269`  
**Target Repository:** `https://github.com/Prathmesh-Yadav0269/Opsync`

---

## 1. Production Architecture Overview

```
                        USERS (Browsers)
                               │
                               ▼
                    ┌──────────────────────┐
                    │        VERCEL        │
                    │ React 18 + Vite SPA  │
                    │ (https://*.vercel.app)│
                    └──────────┬───────────┘
                               │
                               │ HTTPS REST API
                               │ WSS (Socket.IO / WebRTC Signaling)
                               ▼
                    ┌──────────────────────┐
                    │        RENDER        │
                    │ Node.js 18+ Express  │
                    │ Socket.IO Server     │
                    │(https://*.onrender.com)
                    └──────────┬───────────┘
                               │
                               │ Native Driver Connection (TLS)
                               ▼
                    ┌──────────────────────┐
                    │    MONGODB ATLAS     │
                    │  Shared M0 Cluster   │
                    │  Database: opsync    │
                    └──────────────────────┘
```

---

## 2. Step-by-Step Manual Deployment Sequence

### PART A — Push Code to GitHub

> **Note for Commander:** Verify that no `.env` files are tracked before staging. All `.env` files are ignored by `.gitignore`.

1. Open a terminal in the root `Opsync/` project directory.
2. Check git status to review staged and untracked files:
   ```bash
   git status
   ```
3. Stage all prepared files:
   ```bash
   git add .
   ```
4. Commit the changes:
   ```bash
   git commit -m "chore: prepare OPSYNC for production deployment"
   ```
5. Set the primary branch to `main`:
   ```bash
   git branch -M main
   ```
6. Verify or set the GitHub remote origin:
   ```bash
   git remote -v
   ```
   * If `origin` is missing:
     ```bash
     git remote add origin https://github.com/Prathmesh-Yadav0269/Opsync.git
     ```
   * If `origin` points to a different URL:
     ```bash
     git remote set-url origin https://github.com/Prathmesh-Yadav0269/Opsync.git
     ```
7. Push the repository to GitHub:
   ```bash
   git push -u origin main
   ```

---

### PART B — MongoDB Atlas Setup (Free M0 Cluster)

1. Log into your [MongoDB Atlas Dashboard](https://cloud.mongodb.com).
2. Create a new **Shared (M0 Free)** cluster in your preferred AWS/GCP region.
3. Under **Security > Database Access**:
   * Click **Add New Database User**.
   * Choose **Password Authentication**.
   * Create a username (e.g. `opsync_admin`) and a strong, secure password.
   * Assign the role: **Read and write to any database**.
4. Under **Security > Network Access**:
   * Click **Add IP Address**.
   * Click **Allow Access from Anywhere** (`0.0.0.0/0`) to allow connections from Render dynamic IP pools.
   * Confirm and activate the rule.
5. Under **Database > Clusters**:
   * Click **Connect** > **Drivers** (Node.js).
   * Copy the connection string format:
     ```
     mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/opsync?retryWrites=true&w=majority
     ```
   * Replace `<username>` and `<password>` with your database user credentials.
   * Ensure the database name in the path is explicitly set to `/opsync`.
   * **Keep this string safe — DO NOT commit it to Git.**

---

### PART C — Render Backend Deployment

1. Log into your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** > **Web Service**.
3. Connect your GitHub account and select repository: `Prathmesh-Yadav0269/Opsync`.
4. Configure the Web Service settings:
   * **Name:** `opsync-api` (or your chosen service name)
   * **Region:** Same region or close to your MongoDB Atlas cluster (e.g. Frankfurt, Oregon, Ohio, Singapore)
   * **Branch:** `main`
   * **Root Directory:** `server` *(Important: monorepo configuration)*
   * **Runtime:** `Node`
   * **Build Command:** `npm install`
   * **Start Command:** `npm start`
   * **Instance Type:** `Free`
5. Scroll down to **Environment Variables** and add:
   | Key | Value | Notes |
   |---|---|---|
   | `NODE_ENV` | `production` | Enables production security & logging |
   | `PORT` | `5000` | Port for Express HTTP & Socket.IO |
   | `MONGODB_URI` | `mongodb+srv://.../opsync?retryWrites=true&w=majority` | Your MongoDB Atlas connection URI |
   | `JWT_SECRET` | *(Random 32+ character string)* | e.g. `openssl rand -hex 32` |
   | `JWT_EXPIRES_IN` | `7d` | Token validity duration |
   | `CLIENT_URL` | `http://localhost:5173` | *Temporary placeholder — will update in Part E* |
   | `MAX_FILE_SIZE_MB` | `10` | Maximum upload size limit |
6. Click **Create Web Service**.
7. Wait for Render to complete the build and deploy.
8. Copy your Render Service URL from the top of the dashboard:
   ```
   https://opsync-api.onrender.com (example)
   ```
9. Test the backend health endpoint in your browser:
   ```
   https://<your-render-url>/health
   ```
   *Expected response:* `{"success":true,"status":"ok","timestamp":"..."}`

---

### PART D — Vercel Frontend Deployment

1. Log into your [Vercel Dashboard](https://vercel.com).
2. Click **Add New...** > **Project**.
3. Import your GitHub repository: `Prathmesh-Yadav0269/Opsync`.
4. Configure Project Settings:
   * **Framework Preset:** `Vite`
   * **Root Directory:** Click **Edit** and select `client` *(Important: monorepo configuration)*
   * **Build Command:** `npm run build`
   * **Output Directory:** `dist`
   * **Install Command:** `npm install`
5. Expand **Environment Variables** and add:
   | Key | Value | Notes |
   |---|---|---|
   | `VITE_API_URL` | `https://<your-render-url>` | Your Render service URL (NO trailing slash) |
   | `VITE_SOCKET_URL` | `https://<your-render-url>` | Your Render service URL (NO trailing slash) |
6. Click **Deploy**.
7. Wait for Vercel build to complete (~1-2 minutes).
8. Copy your final production Vercel URL:
   ```
   https://opsync-app.vercel.app (example)
   ```

---

### PART E — Resolve the URL Dependency Loop (Final Linkage)

1. Return to your [Render Dashboard](https://dashboard.render.com).
2. Open your `opsync-api` Web Service > **Environment**.
3. Update `CLIENT_URL` to match your exact Vercel production URL (and optionally include localhost for local development):
   ```
   CLIENT_URL=https://<your-vercel-app>.vercel.app
   ```
   *(Or comma-separated: `https://<your-vercel-app>.vercel.app,http://localhost:5173`)*
4. Click **Save Changes**. Render will automatically trigger a rolling restart.
5. Open your Vercel URL in a browser and test authentication and navigation.

---

### PART F — Bootstrap Production Administrator Account

Since the production MongoDB Atlas database is empty, create your initial Admin account using one of the following safe methods:

#### Method 1 — Render Shell (Recommended)
1. In the Render Dashboard, go to your `opsync-api` service > **Shell**.
2. Run the bootstrap command with your desired administrator credentials:
   ```bash
   ADMIN_NAME="Opsync Administrator" ADMIN_EMAIL="admin@yourdomain.com" ADMIN_PASSWORD="YourStrongPassword123!" npm run bootstrap:admin
   ```
3. The script will securely hash your password with bcrypt, save the Admin record to MongoDB Atlas, and output confirmation.

#### Method 2 — Local One-Off Bootstrap via Connection String
1. In your local terminal:
   ```bash
   cd server
   MONGODB_URI="<your-mongodb-atlas-uri>" ADMIN_NAME="Admin" ADMIN_EMAIL="admin@yourdomain.com" ADMIN_PASSWORD="YourStrongPassword123!" npm run bootstrap:admin
   ```

---

## 3. Post-Deployment Verification Checklist

| # | Check Item | How to Verify | Expected Result |
|---|---|---|---|
| 1 | **Backend Health Check** | Visit `https://<render-url>/health` | HTTP 200 `{"status":"ok"}` |
| 2 | **Admin Login** | Log in with bootstrapped Admin credentials | Successfully loads Admin Dashboard |
| 3 | **Employee Registration** | Register a new user at `/register` | Account created with `employee` role |
| 4 | **Team & Task Flow** | Admin creates a Team, assigns Manager, creates Task | Team and task persist and appear in UI |
| 5 | **Real-Time Team Chat** | Open Team Chat in two browser tabs | Real-time message exchange via Socket.IO |
| 6 | **Work Sessions** | Start, pause, resume, and stop a work session | Server timestamps and active duration recorded |
| 7 | **Analytics & Heatmap** | Inspect Analytics overview and Standup Digest | Aggregates dynamically from MongoDB |
| 8 | **SPA Routing Fallback** | Refresh directly on `/dashboard` or `/tasks` | Renders correct page (no 404) |
| 9 | **Theme Persistence** | Toggle Light/Dark/System theme in Settings | Preference saved to MongoDB |

---

## 4. Known Production Limitations (Free-Tier)

1. **Render Free-Tier Spin-Down (Cold Start):**
   * Free Render web services spin down after 15 minutes of inactivity.
   * The first incoming request after idle may take 30–50 seconds while the instance spins up.
   * Subsequent requests will be fast and responsive.

2. **File Storage Ephemerality (Free Render):**
   * Free Render instances use an ephemeral filesystem (`server/storage/uploads/`).
   * Uploaded files remain accessible during the running session, but files may be cleared when Render redeploys or restarts instances.
   * For permanent production enterprise storage, integration with an external S3-compatible cloud bucket is recommended in future phases.

3. **WebRTC NAT Traversal (STUN Only):**
   * WebRTC meetings utilize public Google STUN servers (`stun:stun.l.google.com:19302`).
   * Calls connect smoothly across standard networks and same-machine testing. Highly restrictive symmetric enterprise firewalls may require a dedicated TURN relay server.
   * Final physical two-user camera/mic verification remains pending Commander manual testing.
