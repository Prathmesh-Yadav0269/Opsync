# OPSYNC

> **OPSYNC — Real-Time Team Productivity, Collaboration & Work Analytics Platform**

**Project Owner:** Prathmesh Yadav  
**GitHub Username:** `Prathmesh-Yadav0269`  
**GitHub Repository:** [https://github.com/Prathmesh-Yadav0269/Opsync](https://github.com/Prathmesh-Yadav0269/Opsync)

---

## 1. Overview

OPSYNC is a full-stack, enterprise-grade responsive web application engineered for modern organizational workflow management, real-time collaboration, structured task tracking, productivity analytics, and video conferencing.

### Implemented & Verified Modules:
- **Phase 1**: MERN Foundation + JWT Authentication + Role-Based Access Control (Admin, Manager, Employee)
- **Phase 2**: User & Team Hierarchy + Task Management (Kanban Board, Interactive List, Calendar View)
- **Phase 3**: Real-Time Collaboration (Socket.IO, Presence Registry, Direct 1:1 Chat, Team Chat, Live Task Events, Shell Sync Pulse)
- **Phase 4**: Secure File Attachments + Work Sessions (Server-authoritative timer, single active session conflict rule, private file storage)
- **Phase 5**: Productivity Analytics + Standup Digest (MongoDB Aggregation Pipelines, Yearly Contribution Heatmap, Daily Standups)
- **Phase 6**: WebRTC Video Meetings + Account Settings + Theme Persistence (Light/Dark/System) + Security Hardening

---

## 2. Production Architecture

```
                        USERS (Desktop / Tablet / Mobile)
                                       │
                                       ▼
                      ┌─────────────────────────────────┐
                      │          VERCEL (Edge)          │
                      │     React 18 + Vite SPA Client  │
                      │     (https://*.vercel.app)      │
                      └────────────────┬────────────────┘
                                       │
                                       │ HTTPS REST API
                                       │ WSS (Socket.IO & WebRTC Signaling)
                                       ▼
                      ┌─────────────────────────────────┐
                      │          RENDER (Web)           │
                      │   Node.js 18+ Express Backend   │
                      │   (https://*.onrender.com)      │
                      └────────────────┬────────────────┘
                                       │
                                       │ TLS Driver Connection
                                       ▼
                      ┌─────────────────────────────────┐
                      │          MONGODB ATLAS          │
                      │   Cloud Replica Set (M0 Free)   │
                      │   Database: opsync              │
                      └─────────────────────────────────┘
```

---

## 3. Technology Stack

- **Frontend:** React 18, Vite 5, Tailwind CSS 3, React Router 6, Recharts 3, Socket.IO Client 4, Lucide React
- **Backend:** Node.js 18+, Express 4, Socket.IO 4, Mongoose 8, Multer, Helmet, Express Rate Limit, Express Validator
- **Authentication & Security:** JWT (`jsonwebtoken`), Bcrypt (`bcryptjs`), Cross-Site HTTP-Only Cookies (`sameSite: 'none'`, `secure: true`)
- **Video & Real-Time:** WebRTC Mesh (`RTCPeerConnection`, `getUserMedia`), Google STUN (`stun:stun.l.google.com:19302`)
- **Database:** MongoDB 7+ / MongoDB Atlas

---

## 4. Monorepo Directory Structure

```
Opsync/
├── client/                     # Frontend Vite + React application
│   ├── src/                    # Components, pages, context, api services
│   ├── public/                 # Static public assets
│   ├── vercel.json             # Vercel SPA routing rewrite config
│   ├── package.json            # Frontend dependencies & scripts
│   └── .env.example            # Frontend environment variable template
├── server/                     # Backend Express + Socket.IO server
│   ├── src/
│   │   ├── config/             # Database connection & env validation
│   │   ├── controllers/        # Route controllers
│   │   ├── middleware/         # Auth, RBAC, error handling
│   │   ├── models/             # Mongoose schemas
│   │   ├── routes/             # Modular Express routers
│   │   ├── services/           # Business logic & background aggregations
│   │   ├── sockets/            # Socket.IO handlers & presence registry
│   │   └── utils/              # JWT & cryptographic helpers
│   ├── storage/uploads/        # Private file attachments directory
│   ├── scripts/                # QA reset, bootstrap, and verification scripts
│   ├── package.json            # Backend dependencies & scripts
│   └── .env.example            # Backend environment variable template
├── docs/
│   └── MANUAL_DEPLOYMENT.md    # Comprehensive step-by-step production deployment guide
├── .gitignore                  # Production root gitignore
└── README.md                   # Project documentation
```

---

## 5. Local Development Setup

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **MongoDB**: Local MongoDB instance running on port 27017 (or MongoDB Atlas URI)

### 2. Backend Setup
```bash
cd server
npm install
cp .env.example .env
```
Edit `server/.env`:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/opsync
JWT_SECRET=opsync_dev_jwt_secret_key_change_in_production_min32chars!
CLIENT_URL=http://localhost:5173
```
Start backend:
```bash
npm run dev
# Server running on http://localhost:5000
```

### 3. Frontend Setup
```bash
cd client
npm install
cp .env.example .env
npm run dev
# App running on http://localhost:5173
```

---

## 6. Manual Production Deployment

Detailed manual instructions for deploying OPSYNC to **MongoDB Atlas**, **Render**, and **Vercel** are provided in:
👉 **[`docs/MANUAL_DEPLOYMENT.md`](docs/MANUAL_DEPLOYMENT.md)**

### Production Environment Variables Summary

#### Backend (`server`) — Configure in Render Dashboard:
| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | HTTP Server Port | `5000` |
| `MONGODB_URI` | MongoDB Atlas Connection String | `mongodb+srv://user:pass@cluster0.mongodb.net/opsync` |
| `JWT_SECRET` | Strong Cryptographic Secret | `64-character-random-hex-string` |
| `JWT_EXPIRES_IN` | Token Expiry | `7d` |
| `CLIENT_URL` | Allowed Vercel Frontend Domain | `https://opsync-app.vercel.app` |
| `MAX_FILE_SIZE_MB` | Upload Size Limit | `10` |

#### Frontend (`client`) — Configure in Vercel Dashboard:
| Variable | Description | Example |
|---|---|---|
| `VITE_API_URL` | Render Backend URL | `https://opsync-api.onrender.com` |
| `VITE_SOCKET_URL` | Render Backend URL | `https://opsync-api.onrender.com` |

---

## 7. Production Admin Account Bootstrap

When deploying to a clean MongoDB Atlas instance, create the initial Administrator account using:
```bash
cd server
ADMIN_NAME="Opsync Administrator" ADMIN_EMAIL="admin@yourdomain.com" ADMIN_PASSWORD="YourStrongPassword123!" npm run bootstrap:admin
```

---

## 8. Known Production Limitations (Free Tier)

1. **Free Render Spin-Down (Cold Start):** Free instances spin down after 15 minutes of inactivity. Initial request takes ~30–50s to wake up.
2. **Ephemeral File Storage (Free Render):** Free instances use local filesystem storage (`server/storage/uploads/`). Uploaded files may be cleared on instance redeploy. External S3 storage can be configured for permanent production storage.
3. **WebRTC NAT Traversal (STUN Only):** Public Google STUN servers (`stun:stun.l.google.com:19302`) are configured for P2P mesh video calls. Restrictive corporate firewalls or symmetric NATs require a dedicated TURN relay server. WebRTC meeting signaling and code paths are implemented, but final physical two-user camera/microphone verification remains pending.
