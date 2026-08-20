#  ReachInbox - Email Scheduler

> A production grade email scheduling system built with Next.js, BullMQ, Redis, and MySQL.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![BullMQ](https://img.shields.io/badge/BullMQ-FF6C37?style=for-the-badge&logo=bullmq&logoColor=white)](https://bullmq.io/)
[![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://mysql.com/)

---

##  Overview

ReachInbox is a full stack email scheduling system that:

-  Accepts email send requests via REST APIs
-  Schedules emails at specific times using BullMQ + Redis
-  Sends emails via Ethereal (fake SMTP for testing)
-  Survives server restarts without losing jobs
-  Provides a React dashboard with Google OAuth login
-  Implements per sender rate limiting (100 emails/hour)
-  Handles 1000+ emails under load

---

##  Features Implemented

### Backend Features

| Feature | Implementation |
|---------|----------------|
| Email Scheduling API | `/app/api/emails/route.ts` |
| BullMQ + Redis Queue | `/lib/worker/email-worker.ts` |
| MySQL Database       | `/lib/db/schema.ts` |
| Ethereal SMTP        | `/lib/worker/email-worker.ts` |
| Persistence on Restart | BullMQ + MySQL |
| Worker Concurrency | Configurable (default: 5) |
| Delay Between Emails  | Configurable (default: 5s) |
| Per-Sender Rate Limiting  | Redis-backed (100/hour) |
| Jobs Rescheduled on Limit | `moveToDelayed()` |
| Idempotency | Unique IDs + status locks |
| No Cron Jobs| BullMQ delayed jobs |

### Frontend Features

| Feature | Implementation |
|---------|----------------|
| Google OAuth Login | `/app/api/auth/google/` |
| User Profile Display | Dashboard sidebar |
| Logout  | Sidebar logout button |
| Dashboard  | `/components/reach-inbox-dashboard.tsx` |
| Compose Email Modal | Subject, Body, CSV upload |
| CSV Upload  | Parse and show email count |
| Start Time Picker | DateTime input |
| Delay Between Emails | Number input (seconds) |
| Hourly Limit Setting | Number input |
| Scheduled Emails Table | Status, time, recipient |
| Sent Emails Table | Status, time, recipient |
| Empty States | "No emails found" |

---

##  Architecture Overview

### System Architecture

```bash

┌─────────────────────────────────────────────────────────────────────────────┐
│ │
│ ┌─────────────────┐ │
│ │ Frontend │ │
│ │ (Next.js) │──────────────────────────┐ │
│ │ │ │ │
│ └─────────────────┘ ▼ │
│ │ ┌─────────────────┐ │
│ │ │ API Routes │ │
│ │ │ (Next.js) │ │
│ │ └─────────────────┘ │
│ │ │ │
│ │ ▼ │
│ │ ┌─────────────────┐ │
│ │ │ BullMQ Queue │ │
│ │ │ + Redis │ │
│ │ └─────────────────┘ │
│ │ │ │
│ │ ▼ │
│ │ ┌─────────────────┐ │
│ │ │ Worker │ │
│ │ │ (BullMQ) │ │
│ │ └─────────────────┘ │
│ │ │ │
│ ▼ ▼ │
│ ┌─────────────────┐ ┌─────────────────┐ │
│ │ MySQL │ │ Ethereal │ │
│ │ Database │ │ SMTP │ │
│ └─────────────────┘ └─────────────────┘ │
│ │
└─────────────────────────────────────────────────────────────────────────────┘
```
---

### How Scheduling Works
```bash
User schedules email via UI
↓

API validates input and saves to MySQL
↓

Job added to BullMQ queue with delay
↓

Worker picks up job at scheduled time
↓

Worker checks rate limit (Redis counter)
↓

If allowed → Email sent via Ethereal
↓

Status updated in MySQL → "sent"
```
---

### Persistence on Restart
```bash
Server restarts
↓

BullMQ reconnects to Redis
↓

Scheduler polls MySQL every 10 seconds
↓

Finds jobs: status='scheduled' AND scheduledAt <= now
↓

Re-adds them to BullMQ queue
↓

Jobs sent at correct times 
```
---

### Rate Limiting & Concurrency

| Feature               | Implementation |
|---------              |---------------|
| **Per-Sender Limit**  | Redis key: `userId:YYYY-M-D-H` |
| **Rate Limit Value**  | Configurable via UI (.env default: 100) |
| **Concurrency**       | Configurable via .env (default: 5) |
| **Delay Between Emails** | Configurable via UI (default: 5s) |
| **Safe Across Workers** | Redis atomic counters |
| **Jobs Not Dropped** | Rescheduled to next hour |

---

##  Setup & Installation

### Prerequisites

- Node.js 18+
- pnpm (or npm)
- MySQL + Redis
- Git

### 1. Clone Repository

```bash
git clone https://github.com/sujeets2330/reachinbox-email-scheduler.git
cd reachinbox-email-scheduler
```
### 2. Install Dependencies
```bash
pnpm install
```
### 3. Environment Variables
Create .env file in root:

```bash
env
# =============================================
# DATABASE
# =============================================
DATABASE_URL=mysql://root:yourpassowrd@127.0.0.1:3306/reachinbox or url

# =============================================
# AUTHENTICATION (Google OAuth)
# =============================================
AUTH_SECRET=your-secret-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# =============================================
# REDIS (BullMQ)
# =============================================
REDIS_URL=redis://127.0.0.1:6379
WORKER_CONCURRENCY=5
HOURLY_LIMIT=100

# =============================================
# SMTP (Ethereal Email)
# =============================================
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-ethereal-username
SMTP_PASSWORD=your-ethereal-password
SMTP_FROM=ReachInbox <no-reply@example.com>
```

### 4. Setup Ethereal Email
```bash
# 1. Go to https://ethereal.email
# 2. Click "Create Ethereal Account"
# 3. Copy username and password
# 4. Add to .env file
```
### 5. Start Services (Docker)(If your using)
```bash
# Start MySQL + Redis
docker-compose up -d

# Verify services are running
docker-compose ps
```
### 6. Initialize Database
```bash
# Push schema to MySQL
pnpm run db:push

# Or using the init script
pnpm run db:init
```
### 7. Run the Application
```bash
# Development mode
pnpm run dev

# Production mode
pnpm run build
pnpm run start
```
### 8. Access the Application

Frontend:   http://localhost:3000

## Environment Variables Reference

| Variable          |   Description	               |  Default |
|-------------------|------------------------------|----------|
| DATABASE_URL      |    	MySQL connection string |    -    |
| AUTH_SECRET       |    	Session encryption key	|    -    |
| GOOGLE_CLIENT_ID	|    Google OAuth Client ID	    |    -    |
| GOOGLE_CLIENT_SECRET	|Google OAuth Client Secret | 	 -    |
| GOOGLE_REDIRECT_URI	 |   OAuth callback URL     |http://localhost:3000/api/auth/google/callback |
| REDIS_URL	         |   Redis connection string	| redis://127.0.0.1:6379 |
| WORKER_CONCURRENCY |  	Number of parallel workers	|  5  |
| HOURLY_LIMIT       | 	Max emails per hour (global) |	  100 | 
| SMTP_HOST	         |  SMTP server host	         |   smtp.ethereal.email |
| SMTP_PORT	         |   SMTP port	                 |   587  |
| SMTP_USER	         |   SMTP username               |   	- |
| SMTP_PASSWORD	     |   SMTP password               |  	- | 
| SMTP_FROM	         |   Sender email address	     |   ReachInbox <no-reply@example.com> |

---

## Project Structure

```bash

reachinbox/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── google/
│   │   │   │   ├── route.ts          # Google OAuth init
│   │   │   │   └── callback/route.ts # OAuth callback
│   │   │   └── signout/route.ts      # Logout handler
│   │   ├── emails/
│   │   │   ├── route.ts              # GET/POST emails
│   │   │   ├── schedule/route.ts     # Schedule emails
│   │   │   └── [id]/route.ts         # Update job
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # Dashboard page
│   │   └── login/page.tsx            # Login page
│   ├── components/
│   │   ├── reach-inbox-dashboard.tsx # Main dashboard
│   │   └── ui/
│   │       └── button.tsx            # Reusable button
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts              # DB connection
│   │   │   └── schema.ts             # Drizzle schema
│   │   ├── auth.ts                   # Auth logic
│   │   ├── utils.ts                  # Utilities
│   │   └── worker/
│   │       └── email-worker.ts       # BullMQ worker
│   └── server/
│       ├── emails.ts                 # Email service
│       └── contracts.ts              # Validation
├── scripts/
│   └── init-db.ts                    # DB initialization
├── .env                              # Environment variables
├── docker-compose.yml                # MySQL + Redis
├── package.json
└── README.md
```
---

## Testing

####  Test Email Scheduling
```bash
# 1. Login with Google
# 2. Click "Compose Email"
# 3. Fill in:
#    - Recipients: test@example.com
#    - Subject: Test Email
#    - Body: Hello World
#    - Start Time: 5 minutes from now
#    - Delay: 5 seconds
#    - Hourly Limit: 100
# 4. Click "Schedule Email"
# 5. Check dashboard after 5 minutes
```
#### Test Rate Limiting
```bash
# 1. Schedule 150 emails (100/hour limit)
# 2. First 100 will send
# 3. Next 50 will be rescheduled to next hour
# 4. Check logs: "Rate limit exceeded, rescheduling"
```
#### API Endpoints

|Method	  |    Endpoint	   |   Description |
|---------|----------------|---------------|
|GET	  |  /api/emails   | List all emails|
|POST     |	/api/emails	   |  Schedule new email|
|PATCH    | /api/emails/[id]| Update job status|
|GET	  | /api/auth/google| Initiate Google login|
|GET	  | /api/auth/google/callback |	OAuth callback|
|POST     |	/api/auth/signout	     |  Logout|

##  Tech Stack
#### Backend
Framework: Next.js 16 (App Router)

Language: TypeScript

Queue: BullMQ (backed by Redis)

Database: MySQL (Drizzle ORM)

Email: Ethereal (nodemailer)

Auth: Google OAuth 2.0
----

#### Frontend
Framework: React 19 + Next.js

Styling: Tailwind CSS

Icons: Lucide React

---

### Author
- Sujeet M A
- sujeetmalagundi999@gmail.com
---