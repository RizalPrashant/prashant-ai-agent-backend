# Prashant's AI Talent Agent — Backend

A production-ready backend that lets recruiters chat with or call an AI agent representing Prashant Rizal. The agent answers questions about his background, assesses role fit, and — with permission — emails a conversation summary to both parties, sends Prashant a WhatsApp notification, and can schedule a Google Calendar follow-up.

---

## Quick start

```bash
# 1. Install deps
npm install

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env with your keys

# 3. Run in dev mode (hot-reload)
npm run dev

# 4. Typecheck
npm run typecheck

# 5. Build for production
npm run build
npm start
```

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service + dependency status |
| POST | `/chat/message` | Send a chat message to the agent |
| POST | `/vapi/webhook` | Vapi voice agent webhook endpoint |
| POST | `/email/send-summary` | Manually trigger a summary email |
| POST | `/calendar/schedule` | Schedule a Google Calendar event |
| POST | `/whatsapp/notify` | Send Prashant a WhatsApp notification |

---

## Route details

### `POST /chat/message`

Start or continue a text conversation.

```json
// Request
{
  "message": "Hi, I'm recruiting for a full-stack role at Canva",
  "conversationId": "optional-uuid-to-continue-existing-conversation"
}

// Response
{
  "message": "Great to hear from you! Full-stack is right in Prashant's wheelhouse...",
  "actions": ["Recruiter saved: recruiter@canva.com"],
  "conversationId": "uuid"
}
```

### `POST /vapi/webhook`

Vapi sends all voice events here. Configure this URL in your Vapi dashboard under **Settings → Webhooks**.

Handled event types:
- `assistant-request` — returns the assistant config (model, voice, tools, system prompt)
- `function-call` — executes the named tool (collect info, send email, schedule meeting)
- `end-of-call-report` — saves transcript, notifies Prashant via WhatsApp

### `POST /email/send-summary`

```json
{
  "to": "recruiter@company.com",
  "recruiterName": "Sarah",
  "company": "Canva",
  "roleDiscussed": "Full-Stack Engineer",
  "summary": "...",
  "conversationId": "optional"
}
```

### `POST /calendar/schedule`

```json
{
  "recruiterEmail": "recruiter@company.com",
  "recruiterName": "Sarah",
  "proposedTime": "2026-06-15T10:00:00+10:00",
  "durationMinutes": 30,
  "meetingTopic": "Intro call — Prashant Rizal",
  "conversationId": "optional"
}
```

### `POST /whatsapp/notify`

```json
{
  "recruiterEmail": "recruiter@company.com",
  "recruiterName": "Sarah",
  "company": "Canva",
  "role": "Full-Stack Engineer",
  "summary": "..."
}
```

---

## Environment variables

See `.env.example` for the full list with inline documentation.

### Gmail setup
1. Enable 2-Step Verification on your Google account
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Generate an App Password for "Mail"
4. Use that 16-character password as `SMTP_PASS`

### WhatsApp Cloud API setup
1. Go to [developers.facebook.com](https://developers.facebook.com) → Create App → Business
2. Add WhatsApp product
3. Copy **Phone Number ID** → `WHATSAPP_PHONE_NUMBER_ID`
4. Generate a permanent access token → `WHATSAPP_ACCESS_TOKEN`
5. Add your number as a test recipient in the sandbox

### Google Calendar setup (Service Account)
1. [console.cloud.google.com](https://console.cloud.google.com) → Enable Calendar API
2. Create a Service Account → download JSON key
3. Set `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY` from the JSON
4. Share your Google Calendar with the service account email (give it **"Make changes to events"**)

### Vapi setup
1. Sign up at [vapi.ai](https://vapi.ai)
2. Create an assistant (or let `assistant-request` configure it dynamically)
3. Set webhook URL to `https://your-domain.com/vapi/webhook`
4. Enable the tools: `collect_recruiter_info`, `send_conversation_summary`, `schedule_meeting`

---

## Database

SQLite at `./data/agent.db` (created automatically on first start).

| Table | Purpose |
|-------|---------|
| `recruiters` | Contact info collected during conversations |
| `conversations` | One row per chat session or voice call |
| `messages` | Individual user/assistant messages |
| `summaries` | Generated summaries, email/WhatsApp send status |
| `scheduled_events` | Google Calendar events created |

---

## Deployment (Railway / Render / Fly.io)

```bash
# Build
npm run build

# Start
node dist/index.js
```

Set all environment variables in your hosting dashboard. The SQLite file is ephemeral on most platforms — use a persistent volume or switch to Postgres/Supabase for production data durability.

### Recommended: persistent volume on Railway
1. Add a volume mounted at `/app/data`
2. Set `DB_PATH=/app/data/agent.db`

---

## Project structure

```
src/
├── index.ts          — Express server entry point
├── db.ts             — SQLite schema + query helpers
├── agent.ts          — OpenAI agent loop, tools, Vapi config
├── routes/
│   ├── index.ts      — Route aggregator
│   ├── health.ts     — GET /health
│   ├── chat.ts       — POST /chat/message
│   ├── vapi.ts       — POST /vapi/webhook
│   ├── email.ts      — POST /email/send-summary
│   ├── calendar.ts   — POST /calendar/schedule
│   └── whatsapp.ts   — POST /whatsapp/notify
└── services/
    ├── email.ts      — Nodemailer / Gmail SMTP
    ├── whatsapp.ts   — Meta WhatsApp Cloud API
    └── calendar.ts   — Google Calendar API
```
